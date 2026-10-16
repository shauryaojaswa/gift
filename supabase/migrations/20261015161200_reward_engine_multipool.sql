-- JRIQ Phase 2 migration 3 of 3: server-authoritative multi-gift reward engine
-- (Option B — equal probability) and platform/shop management RPCs.
-- ADDITIVE ONLY: reward_tiers.reward_id becomes nullable; submit_customer_entry is
-- replaced with the SAME signature and return shape (frontend-compatible); the
-- legacy single-reward path is preserved as the fallback, so existing shops
-- (including the production shop) behave identically until a bracket opts in.
-- See docs/MIGRATION_PROPOSAL.md §4 (amended 2026-10-15).

alter table public.reward_tiers alter column reward_id drop not null;

-- ---------------------------------------------------------------------------
-- 1. submit_customer_entry — pool first (uniform random), legacy fallback.
--    Preserved from 20261010203000_managed_tenant_foundation.sql: input
--    validation, phone normalization, campaign-active check, idempotent replay
--    of identical request_id, conflicting-reuse rejection, per-phone rate limit,
--    claim-code derivation, snapshot persistence, post-insert verification.
-- ---------------------------------------------------------------------------
create or replace function public.submit_customer_entry(
  p_store_slug text,
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_purchase_amount integer,
  p_review_cta_shown boolean default false,
  p_review_cta_clicked boolean default false
)
returns table (
  submission_id uuid,
  claim_code text,
  reward jsonb,
  tier jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_reward public.rewards%rowtype;
  v_tier public.reward_tiers%rowtype;
  v_existing public.submissions%rowtype;
  v_phone text;
  v_claim_code text;
  v_match_count integer;
  v_now timestamptz := now();
begin
  if p_request_id is null
    or p_customer_name is null
    or length(btrim(p_customer_name)) not between 2 and 80
    or btrim(p_customer_name) !~ '^[[:alpha:]][[:alpha:][:digit:] .''-]*$'
    or p_customer_phone is null
    or p_purchase_amount is null
    or p_purchase_amount <= 0
    or p_purchase_amount > 100000000
  then
    raise exception 'Invalid customer entry';
  end if;

  v_phone := regexp_replace(p_customer_phone, '[^0-9]', '', 'g');
  if length(v_phone) = 12 and left(v_phone, 2) = '91' then
    v_phone := right(v_phone, 10);
  elsif length(v_phone) = 11 and left(v_phone, 1) = '0' then
    v_phone := right(v_phone, 10);
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;

  select * into v_store
  from public.stores
  where slug = p_store_slug and active and status = 'active'
    and public.is_store_campaign_active(id)
  for share;
  if not found then
    raise exception 'Campaign is unavailable';
  end if;

  select * into v_existing
  from public.submissions s
  where s.store_id = v_store.id and s.request_id = p_request_id;
  if found then
    if v_existing.customer_name <> btrim(p_customer_name)
      or v_existing.customer_phone <> v_phone
      or v_existing.purchase_amount <> p_purchase_amount
    then
      raise exception 'This entry reference has already been used';
    end if;
    submission_id := v_existing.id;
    claim_code := v_existing.coupon_code;
    reward := jsonb_build_object(
      'id', v_existing.reward_id,
      'name', v_existing.reward_label,
      'wheel_label', v_existing.reward_wheel_label,
      'description', coalesce(v_existing.reward_description, ''),
      'voucher_value', v_existing.reward_voucher_value,
      'claim_code_prefix', v_existing.reward_claim_code_prefix,
      'validity_text', v_existing.reward_validity_text,
      'active', true
    );
    tier := jsonb_build_object(
      'id', v_existing.assigned_tier_id,
      'min_amount', v_existing.assigned_tier_min_amount,
      'max_amount', v_existing.assigned_tier_max_amount,
      'reward_id', v_existing.reward_id,
      'target_segment', v_existing.target_segment,
      'active', true
    );
    return next;
    return;
  end if;

  insert into public.public_submission_rate_limits (
    store_id, phone_digest, window_started_at, submission_count
  )
  values (
    v_store.id,
    encode(extensions.digest(v_store.id::text || ':' || v_phone, 'sha256'), 'hex'),
    v_now,
    1
  )
  on conflict (store_id, phone_digest) do update
  set submission_count = case
        when public.public_submission_rate_limits.window_started_at < v_now - interval '1 hour' then 1
        else public.public_submission_rate_limits.submission_count + 1
      end,
      window_started_at = case
        when public.public_submission_rate_limits.window_started_at < v_now - interval '1 hour' then v_now
        else public.public_submission_rate_limits.window_started_at
      end;
  if (select submission_count from public.public_submission_rate_limits
      where store_id = v_store.id
        and phone_digest = encode(extensions.digest(v_store.id::text || ':' || v_phone, 'sha256'), 'hex')) > 5 then
    raise exception 'Too many entries. Please try again later';
  end if;

  -- Resolve exactly one viable active bracket (half-open [min, max), floored at
  -- the store minimum). A bracket is viable when it has an active gift pool or
  -- an active legacy reward; anything else raises rather than awarding a prize.
  select count(*) into v_match_count
  from public.reward_tiers t
  where t.store_id = v_store.id and t.active
    and p_purchase_amount >= greatest(t.min_amount, v_store.min_spin_amount)
    and (t.max_amount is null or p_purchase_amount < t.max_amount)
    and (
      exists (
        select 1
        from public.tier_gift_options o
        join public.rewards pool_reward
          on pool_reward.store_id = t.store_id and pool_reward.id = o.reward_id
        join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
        where o.tier_id = t.id and o.active and pool_reward.active and g.active
      )
      or (
        t.reward_id is not null and exists (
          select 1 from public.rewards r
          where r.store_id = t.store_id and r.id = t.reward_id and r.active
        )
      )
    );
  if v_match_count <> 1 then
    raise exception 'No unique active reward is configured for this purchase amount';
  end if;

  select t.* into v_tier
  from public.reward_tiers t
  where t.store_id = v_store.id and t.active
    and p_purchase_amount >= greatest(t.min_amount, v_store.min_spin_amount)
    and (t.max_amount is null or p_purchase_amount < t.max_amount)
    and (
      exists (
        select 1
        from public.tier_gift_options o
        join public.rewards pool_reward
          on pool_reward.store_id = t.store_id and pool_reward.id = o.reward_id
        join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
        where o.tier_id = t.id and o.active and pool_reward.active and g.active
      )
      or (
        t.reward_id is not null and exists (
          select 1 from public.rewards r
          where r.store_id = t.store_id and r.id = t.reward_id and r.active
        )
      )
    );

  -- Equal-probability selection from the shop's approved pool for this bracket.
  -- The pool is built server-side only: active options -> active rewards ->
  -- active catalogue entries. The client can never influence it.
  select r.* into v_reward
  from public.tier_gift_options o
  join public.rewards r
    on r.store_id = v_store.id and r.id = o.reward_id and r.active
  join public.gift_catalog g on g.id = r.catalog_gift_id and g.active
  where o.tier_id = v_tier.id and o.active
  order by random()
  limit 1;

  -- Legacy fallback: brackets without options keep the historical single-reward
  -- behaviour exactly (existing production shop unchanged).
  if v_reward.id is null then
    if v_tier.reward_id is null then
      raise exception 'No active reward is configured for this purchase amount';
    end if;
    select r.* into v_reward
    from public.rewards r
    where r.id = v_tier.reward_id and r.store_id = v_store.id and r.active;
    if not found then
      raise exception 'No active reward is configured for this purchase amount';
    end if;
  end if;

  v_claim_code := coalesce(nullif(v_reward.claim_code_prefix, ''), 'GIFT')
    || '-' || upper(substr(replace(p_request_id::text, '-', ''), 1, 8));

  insert into public.submissions (
    id, store_id, customer_name, customer_phone, purchase_amount,
    reward_id, reward_label, reward_description, coupon_code,
    reward_claim_code_prefix, reward_validity_text, reward_wheel_label, reward_voucher_value,
    assigned_tier_id, target_segment,
    assigned_tier_min_amount, assigned_tier_max_amount,
    collection_status, request_id, review_cta_shown, review_cta_clicked, created_at
  )
  values (
    p_request_id, v_store.id, btrim(p_customer_name), v_phone, p_purchase_amount,
    v_reward.id, v_reward.name, v_reward.description, v_claim_code,
    v_reward.claim_code_prefix, v_reward.validity_text, v_reward.wheel_label, v_reward.voucher_value,
    v_tier.id, v_tier.target_segment,
    v_tier.min_amount, v_tier.max_amount,
    'awaiting', p_request_id, coalesce(p_review_cta_shown, false),
    coalesce(p_review_cta_clicked, false), v_now
  )
  on conflict (id) do nothing;

  select * into v_existing
  from public.submissions s
  where s.store_id = v_store.id and s.request_id = p_request_id;

  if not found then
    raise exception 'Could not save customer entry';
  end if;
  if v_existing.customer_name <> btrim(p_customer_name)
    or v_existing.customer_phone <> v_phone
    or v_existing.purchase_amount <> p_purchase_amount
  then
    raise exception 'This entry reference has already been used';
  end if;

  submission_id := v_existing.id;
  claim_code := v_existing.coupon_code;
  reward := jsonb_build_object(
    'id', v_existing.reward_id,
    'name', v_existing.reward_label,
    'wheel_label', v_existing.reward_wheel_label,
    'description', coalesce(v_existing.reward_description, ''),
    'voucher_value', v_existing.reward_voucher_value,
    'claim_code_prefix', v_existing.reward_claim_code_prefix,
    'validity_text', v_existing.reward_validity_text,
    'active', true
  );
  tier := jsonb_build_object(
    'id', v_existing.assigned_tier_id,
    'min_amount', v_existing.assigned_tier_min_amount,
    'max_amount', v_existing.assigned_tier_max_amount,
    'reward_id', v_existing.reward_id,
    'target_segment', v_existing.target_segment,
    'active', true
  );
  return next;
end;
$$;

revoke all on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean) from public;
grant execute on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. save_store_gift_options — materialize catalogue selections into the shop's
--    pool for one bracket. Full replacement of that bracket's pool.
-- ---------------------------------------------------------------------------
create or replace function public.save_store_gift_options(
  p_tier_id uuid,
  p_catalog_gift_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier public.reward_tiers%rowtype;
  v_store_id uuid;
  v_max integer;
  v_selected integer;
begin
  if p_tier_id is null or p_catalog_gift_ids is null then
    raise exception 'Invalid gift selection';
  end if;

  select * into v_tier from public.reward_tiers t where t.id = p_tier_id;
  if not found then
    raise exception 'Purchase tier not found';
  end if;
  v_store_id := v_tier.store_id;
  if not (public.is_store_admin(v_store_id) or public.is_platform_admin()) then
    raise exception 'Store workspace access is not active';
  end if;

  select coalesce((pp.value #>> '{}')::integer, 4) into v_max
  from public.platform_policies pp
  where pp.key = 'max_gift_selections_per_bracket';

  v_selected := coalesce(array_length(p_catalog_gift_ids, 1), 0);

  if v_selected = 0 then
    delete from public.tier_gift_options o where o.tier_id = p_tier_id;
    return;
  end if;

  if v_selected > v_max then
    raise exception 'A bracket can offer at most % approved gifts', v_max;
  end if;
  if (select count(distinct gift_id) from unnest(p_catalog_gift_ids) as u(gift_id)) <> v_selected then
    raise exception 'Duplicate gifts are not allowed in one bracket';
  end if;
  if (select count(*) from public.gift_catalog g
      where g.id = any(p_catalog_gift_ids) and g.active) <> v_selected then
    raise exception 'One or more selected gifts are inactive or unknown';
  end if;

  -- Materialize: one store-local rewards row per selected catalogue gift.
  insert into public.rewards (
    store_id, catalog_gift_id, name, wheel_label, description,
    voucher_value, claim_code_prefix, validity_text, active
  )
  select v_store_id, g.id, g.name, g.wheel_label, g.description,
    g.voucher_value, g.claim_code_prefix, g.validity_text, true
  from public.gift_catalog g
  where g.id = any(p_catalog_gift_ids)
  on conflict (store_id, catalog_gift_id) where catalog_gift_id is not null
  do update set active = true, updated_at = now();

  -- Full replacement of this bracket's pool (catalogue-derived options only).
  delete from public.tier_gift_options o where o.tier_id = p_tier_id;

  insert into public.tier_gift_options (store_id, tier_id, reward_id, active)
  select v_store_id, p_tier_id, r.id, true
  from public.rewards r
  where r.store_id = v_store_id and r.catalog_gift_id = any(p_catalog_gift_ids);
end;
$$;

revoke all on function public.save_store_gift_options(uuid, uuid[]) from public, anon;
grant execute on function public.save_store_gift_options(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_save_store_tiers — platform-admin bracket editing with explicit
--    store (legacy save_store_tiers keeps its single-store owner semantics).
--    Pool-based brackets may have reward_id null; target_segment is a display
--    hint on this path. Contiguity and min-spin alignment remain enforced.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_store_tiers(
  p_store_id uuid,
  p_tiers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min_spin_amount integer;
  v_tier_count integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform access is required';
  end if;
  if p_store_id is null or jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'Invalid tier configuration';
  end if;

  select s.min_spin_amount into v_min_spin_amount
  from public.stores s where s.id = p_store_id for update;
  if not found then
    raise exception 'Store not found';
  end if;

  select count(*) into v_tier_count
  from jsonb_to_recordset(p_tiers) as t(
    id uuid, min_amount integer, max_amount integer,
    reward_id uuid, target_segment integer, active boolean
  );
  if v_tier_count = 0 then
    raise exception 'At least one purchase tier is required';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer,
      reward_id uuid, target_segment integer, active boolean
    )
    where id is null or min_amount is null or active is null
      or target_segment is null
      or min_amount <= 0
      or (max_amount is not null and max_amount <= min_amount)
      or target_segment not between 0 and 7
  ) then
    raise exception 'One or more purchase tiers have invalid values';
  end if;
  if (select count(distinct t.id) from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer,
      reward_id uuid, target_segment integer, active boolean
    )) <> v_tier_count then
    raise exception 'Purchase tier IDs must be unique';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer,
      reward_id uuid, target_segment integer, active boolean
    )
    left join public.rewards r on r.id = t.reward_id and r.store_id = p_store_id
    where t.reward_id is not null and (r.id is null or (t.active and not r.active))
  ) then
    raise exception 'Every tier must reference a gift in this store';
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer,
      reward_id uuid, target_segment integer, active boolean
    ) where active
  ) then
    raise exception 'At least one purchase tier must be active';
  end if;
  if (
    select min(min_amount) from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer,
      reward_id uuid, target_segment integer, active boolean
    ) where active
  ) <> v_min_spin_amount then
    raise exception 'The first active tier must start at the minimum purchase amount';
  end if;
  if exists (
    with ordered as (
      select min_amount, max_amount,
        row_number() over (order by min_amount) as tier_rank,
        lag(max_amount) over (order by min_amount) as previous_max
      from jsonb_to_recordset(p_tiers) as t(
        id uuid, min_amount integer, max_amount integer,
        reward_id uuid, target_segment integer, active boolean
      )
      where active
    )
    select 1 from ordered
    where (tier_rank > 1 and previous_max is distinct from min_amount)
       or (tier_rank = (select count(*) from ordered) and max_amount is not null)
  ) then
    raise exception 'Active purchase tiers must cover all qualifying amounts without gaps or overlaps';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer,
      reward_id uuid, target_segment integer, active boolean
    )
    join public.reward_tiers existing on existing.id = t.id
    where existing.store_id <> p_store_id
  ) then
    raise exception 'A purchase tier belongs to another store';
  end if;

  delete from public.reward_tiers existing
  where existing.store_id = p_store_id
    and not exists (
      select 1 from jsonb_to_recordset(p_tiers) as t(
        id uuid, min_amount integer, max_amount integer,
        reward_id uuid, target_segment integer, active boolean
      ) where t.id = existing.id
    );

  insert into public.reward_tiers (
    id, store_id, min_amount, max_amount, reward_id, target_segment, active, updated_at
  )
  select t.id, p_store_id, t.min_amount, t.max_amount, t.reward_id, t.target_segment, t.active, now()
  from jsonb_to_recordset(p_tiers) as t(
    id uuid, min_amount integer, max_amount integer,
    reward_id uuid, target_segment integer, active boolean
  )
  on conflict (id) do update set
    min_amount = excluded.min_amount,
    max_amount = excluded.max_amount,
    reward_id = excluded.reward_id,
    target_segment = excluded.target_segment,
    active = excluded.active,
    updated_at = now()
  where public.reward_tiers.store_id = p_store_id;
end;
$$;

revoke all on function public.admin_save_store_tiers(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_store_tiers(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_shop — atomic onboarding (store + bracket template + trial
--    subscription + owner link or pending invitation). Idempotent on slug.
-- ---------------------------------------------------------------------------
create or replace function public.create_shop(
  p_name text,
  p_slug text,
  p_owner_email text,
  p_logo_url text default null,
  p_tiers jsonb default null
)
returns table (
  shop_id uuid,
  shop_slug text,
  shop_name text,
  customer_path text,
  owner_link_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_store_name text;
  v_existing_name text;
  v_owner_id uuid;
  v_email text;
  v_status text;
  v_tiers jsonb;
  v_min_spin integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform access is required';
  end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 80 then
    raise exception 'Shop name must be 2-80 characters';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 60 then
    raise exception 'Invalid shop slug';
  end if;
  v_email := lower(btrim(coalesce(p_owner_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid owner email';
  end if;

  -- Idempotent create: a retried identical request returns the existing shop.
  select s.id, s.name into v_store_id, v_existing_name
  from public.stores s where s.slug = p_slug;
  if found then
    if v_existing_name <> btrim(p_name) then
      raise exception 'URL slug already in use';
    end if;
    select inv.status into v_status
    from public.store_owner_invitations inv where inv.store_id = v_store_id;
    if v_status is null then
      v_status := 'linked';
    end if;
    shop_id := v_store_id;
    shop_slug := p_slug;
    shop_name := v_existing_name;
    customer_path := '/store/' || p_slug;
    owner_link_status := v_status;
    return next;
    return;
  end if;

  v_min_spin := coalesce((
    select (pp.value #>> '{}')::integer
    from public.platform_policies pp where pp.key = 'default_min_spin_amount'
  ), 1000);

  insert into public.stores (slug, name, logo_url, min_spin_amount, status, active)
  values (p_slug, btrim(p_name), p_logo_url, v_min_spin, 'onboarding', true)
  returning stores.id, stores.name into v_store_id, v_store_name;

  v_tiers := coalesce(p_tiers, (
    select pp.value from public.platform_policies pp where pp.key = 'default_brackets'
  ));
  if v_tiers is null or jsonb_typeof(v_tiers) <> 'array' then
    raise exception 'No purchase bracket template is configured';
  end if;

  if exists (
    with ordered as (
      select t.min_amount, t.max_amount,
        row_number() over (order by t.min_amount) as tier_rank,
        lag(t.max_amount) over (order by t.min_amount) as previous_max
      from jsonb_to_recordset(v_tiers) as t(min_amount integer, max_amount integer, target_segment integer)
    )
    select 1 from ordered
    where min_amount is null or min_amount <= 0
       or (max_amount is not null and max_amount <= min_amount)
       or (tier_rank > 1 and previous_max is distinct from min_amount)
       or (tier_rank = (select count(*) from ordered) and max_amount is not null)
  ) then
    raise exception 'Purchase bracket template must cover all amounts without gaps or overlaps';
  end if;

  insert into public.reward_tiers (store_id, min_amount, max_amount, reward_id, target_segment, active)
  select v_store_id, t.min_amount, t.max_amount, null,
    coalesce(t.target_segment, 0), true
  from jsonb_to_recordset(v_tiers) as t(min_amount integer, max_amount integer, target_segment integer);

  insert into public.store_subscriptions (store_id, status, payment_status, trial_ends_at)
  values (v_store_id, 'trial', 'unpaid', current_date + interval '30 days');

  select u.id into v_owner_id
  from auth.users u where lower(u.email) = v_email limit 1;

  if v_owner_id is not null then
    insert into public.store_admins (store_id, user_id, email, role)
    values (v_store_id, v_owner_id, v_email, 'owner')
    on conflict (store_id, user_id) do nothing;
    v_status := 'linked';
  else
    insert into public.store_owner_invitations (store_id, email, invited_by)
    values (v_store_id, v_email, (select auth.uid()));
    v_status := 'pending';
  end if;

  shop_id := v_store_id;
  shop_slug := p_slug;
  shop_name := v_store_name;
  customer_path := '/store/' || p_slug;
  owner_link_status := v_status;
  return next;
end;
$$;

revoke all on function public.create_shop(text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_shop(text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. link_store_owner — associate an existing auth account with a shop.
-- ---------------------------------------------------------------------------
create or replace function public.link_store_owner(
  p_store_id uuid,
  p_email text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_owner_id uuid;
  v_store_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform access is required';
  end if;
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid owner email';
  end if;
  select s.name into v_store_name from public.stores s where s.id = p_store_id;
  if not found then
    raise exception 'Shop not found';
  end if;

  select u.id into v_owner_id from auth.users u where lower(u.email) = v_email limit 1;
  if v_owner_id is null then
    raise exception 'No account exists for this email yet. Ask the owner to sign up first.';
  end if;

  insert into public.store_admins (store_id, user_id, email, role)
  values (p_store_id, v_owner_id, v_email, 'owner')
  on conflict (store_id, user_id) do nothing;

  insert into public.store_owner_invitations (store_id, email, invited_by)
  values (p_store_id, v_email, (select auth.uid()))
  on conflict (store_id) do update
    set status = 'linked', linked_at = now(), email = excluded.email;

  return 'linked';
end;
$$;

revoke all on function public.link_store_owner(uuid, text) from public, anon;
grant execute on function public.link_store_owner(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. set_store_status — activate / suspend / onboarding, audited.
-- ---------------------------------------------------------------------------
create or replace function public.set_store_status(
  p_store_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform access is required';
  end if;
  if p_status not in ('active', 'suspended', 'onboarding') then
    raise exception 'Invalid shop status';
  end if;
  update public.stores s
  set status = p_status, updated_at = now()
  where s.id = p_store_id;
  if not found then
    raise exception 'Shop not found';
  end if;
end;
$$;

revoke all on function public.set_store_status(uuid, text) from public, anon;
grant execute on function public.set_store_status(uuid, text) to authenticated;
