-- =============================================================================
-- v1.3.0 - gift price policy, per-shop gift availability, declared values,
--          gift quantities (Option B pools, additive + function replacement)
-- =============================================================================
-- WHY (task: "Gift selection by purchase bracket - high priority"):
--   * Central platform control of "the allowed price range or price policy for
--     each gift type"            -> gift_catalog.value_min / value_max
--   * Central control of "the gift types each shop is permitted to use"
--                                  -> gift_catalog.excluded_store_ids
--   * Owner "adjust gift prices or declared values within permitted limits"
--                                  -> tier_gift_options.declared_value
--   * Owner "adjust quantities or inventory limits ... if it can be added
--     safely"                    -> tier_gift_options.quantity / quantity_claimed
-- All limits are enforced SERVER-SIDE in save_store_gift_options and
-- submit_customer_entry; the UI merely surfaces them.
--
-- VALUE MODEL (kept deliberately separate, per the brief):
--   purchase_amount       what the customer paid        (submissions.purchase_amount)
--   voucher_value         the catalogue's declared value(gift_catalog/rewards)
--   declared_value        the shop's per-bracket override (nullable, bounded)
--   effective value       coalesce(declared_value, voucher_value)
--   value_min/value_max   the platform's price policy for that gift TYPE
--   quantity              per-bracket issuance cap (null = unlimited)
-- A customer's qualifying purchase NEVER equals the gift's value.
--
-- IMMUTABILITY: submissions already snapshot reward_* columns at issue time;
-- this migration snapshots the EFFECTIVE value there. Editing catalogue prices
-- later never rewrites an issued reward (existing snapshot contract).
--
-- SAFETY: additive columns + replacements of three functions that keep their
-- signatures callable (save_store_gift_options keeps its 2-arg call shape via
-- defaults). No drops of tables/policies. Applied to staging first, verified
-- by scripts/backend-e2e.mjs, then production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Platform price policy + per-shop availability on the catalogue
-- ---------------------------------------------------------------------------
alter table public.gift_catalog
  add column if not exists value_min integer,
  add column if not exists value_max integer,
  add column if not exists excluded_store_ids uuid[] not null default '{}';

alter table public.gift_catalog
  drop constraint if exists gift_catalog_value_policy_check;
alter table public.gift_catalog
  add constraint gift_catalog_value_policy_check
  check (
    (value_min is null and value_max is null)
    or (value_min is not null and value_max is not null
        and value_min >= 0 and value_max >= value_min)
  );

alter table public.gift_catalog
  drop constraint if exists gift_catalog_default_value_in_policy_check;
alter table public.gift_catalog
  add constraint gift_catalog_default_value_in_policy_check
  check (
    voucher_value is null
    or value_min is null
    or (voucher_value >= value_min and voucher_value <= value_max)
  );

comment on column public.gift_catalog.value_min is
  'Platform price policy: lowest declared value a shop may set (null = fixed value)';
comment on column public.gift_catalog.value_max is
  'Platform price policy: highest declared value a shop may set (null = fixed value)';
comment on column public.gift_catalog.excluded_store_ids is
  'Shops that may NOT select this gift type (empty = available to every shop)';

-- ---------------------------------------------------------------------------
-- 2. Per-bracket option: declared value override + quantity limits
-- ---------------------------------------------------------------------------
alter table public.tier_gift_options
  add column if not exists declared_value integer,
  add column if not exists quantity integer,
  add column if not exists quantity_claimed integer not null default 0;

alter table public.tier_gift_options
  drop constraint if exists tier_gift_options_declared_value_check;
alter table public.tier_gift_options
  add constraint tier_gift_options_declared_value_check
  check (declared_value is null or declared_value >= 0);

alter table public.tier_gift_options
  drop constraint if exists tier_gift_options_quantity_check;
alter table public.tier_gift_options
  add constraint tier_gift_options_quantity_check
  check (quantity is null or (quantity > 0 and quantity <= 100000));

alter table public.tier_gift_options
  drop constraint if exists tier_gift_options_quantity_claimed_check;
alter table public.tier_gift_options
  add constraint tier_gift_options_quantity_claimed_check
  check (quantity_claimed >= 0);

comment on column public.tier_gift_options.declared_value is
  'Shop-declared value for this bracket option; null = catalogue voucher_value';
comment on column public.tier_gift_options.quantity is
  'Issuance cap for this bracket option; null = unlimited';
comment on column public.tier_gift_options.quantity_claimed is
  'Issued count, incremented only by submit_customer_entry (never reset on save)';

-- ---------------------------------------------------------------------------
-- 3. Catalogue sync trigger: catalogue stays the single mutable source of
--    display data, and a policy change invalidates out-of-policy overrides.
--    Issued submissions are NEVER touched (snapshot contract).
-- ---------------------------------------------------------------------------
create or replace function public.sync_catalog_gift_to_rewards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rewards r
  set name = new.name,
      wheel_label = new.wheel_label,
      description = new.description,
      voucher_value = new.voucher_value,
      claim_code_prefix = new.claim_code_prefix,
      validity_text = new.validity_text,
      updated_at = now()
  where r.catalog_gift_id = new.id
    and (r.name is distinct from new.name
      or r.wheel_label is distinct from new.wheel_label
      or r.description is distinct from new.description
      or r.voucher_value is distinct from new.voucher_value
      or r.claim_code_prefix is distinct from new.claim_code_prefix
      or r.validity_text is distinct from new.validity_text);

  -- A narrowed/removed price policy drops now-illegal shop overrides back to
  -- the catalogue default value. In-range overrides survive untouched.
  update public.tier_gift_options o
  set declared_value = null,
      updated_at = now()
  from public.rewards r
  where o.reward_id = r.id
    and r.catalog_gift_id = new.id
    and o.declared_value is not null
    and (new.value_min is null or new.value_max is null
      or o.declared_value < new.value_min
      or o.declared_value > new.value_max);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. save_store_gift_options - server-enforced bracket pool save.
--    NEW enforcement (everything is checked here, never only in the UI):
--      * max selections per bracket (platform_policies, unchanged rule)
--      * no duplicate gifts, gifts must be active
--      * a gift excluded for this shop cannot be selected
--      * declared_value only for adjustable gifts and within [value_min,value_max]
--      * quantity within 1..100000
--    Existing options survive as rows (soft deactivate) so quantity_claimed
--    history and issued counts are never silently reset by a re-save.
-- ---------------------------------------------------------------------------
drop function if exists public.save_store_gift_options(uuid, uuid[]);

create or replace function public.save_store_gift_options(
  p_tier_id uuid,
  p_catalog_gift_ids uuid[],
  p_declared_values jsonb default null,
  p_quantities jsonb default null
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
  v_entry record;
  v_gift public.gift_catalog%rowtype;
  v_value integer;
begin
  if p_tier_id is null or p_catalog_gift_ids is null then
    raise exception 'Invalid gift selection';
  end if;
  if p_declared_values is not null and jsonb_typeof(p_declared_values) <> 'object' then
    raise exception 'Invalid gift values';
  end if;
  if p_quantities is not null and jsonb_typeof(p_quantities) <> 'object' then
    raise exception 'Invalid gift quantities';
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
    -- Clear the pool but keep rows so issued-count history is preserved.
    update public.tier_gift_options o
    set active = false, updated_at = now()
    where o.tier_id = p_tier_id and o.active;
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
  if exists (
    select 1 from public.gift_catalog g
    where g.id = any(p_catalog_gift_ids)
      and v_store_id = any(g.excluded_store_ids)
  ) then
    raise exception 'One or more selected gifts are not available for this shop';
  end if;

  -- Price policy: overrides are only legal for adjustable gifts, inside the
  -- platform bounds. Malformed maps raise clean errors (never raw cast noise).
  if p_declared_values is not null then
    for v_entry in
      select e.key as k, e.value as v from jsonb_each(p_declared_values) e
    loop
      if v_entry.k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid gift values';
      end if;
      if not exists (
        select 1 from unnest(p_catalog_gift_ids) as u(gift_id)
        where u.gift_id = v_entry.k::uuid
      ) then
        continue;
      end if;
      if jsonb_typeof(v_entry.v) <> 'number'
        or (v_entry.v #>> '{}') !~ '^-?[0-9]+$' then
        raise exception 'A gift value must be a whole number';
      end if;
      v_value := (v_entry.v #>> '{}')::integer;
      select * into v_gift from public.gift_catalog g where g.id = v_entry.k::uuid;
      if v_gift.value_min is null or v_gift.value_max is null then
        raise exception 'The platform price policy fixes the value of %', v_gift.name;
      end if;
      if v_value < v_gift.value_min or v_value > v_gift.value_max then
        raise exception 'A gift value is outside the platform price policy for that gift';
      end if;
    end loop;
  end if;

  -- Quantities: 1..100000 when given.
  if p_quantities is not null then
    for v_entry in
      select e.key as k, e.value as v from jsonb_each(p_quantities) e
    loop
      if v_entry.k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid gift quantities';
      end if;
      if not exists (
        select 1 from unnest(p_catalog_gift_ids) as u(gift_id)
        where u.gift_id = v_entry.k::uuid
      ) then
        continue;
      end if;
      if jsonb_typeof(v_entry.v) <> 'number'
        or (v_entry.v #>> '{}') !~ '^[0-9]+$'
        or (v_entry.v #>> '{}')::integer not between 1 and 100000 then
        raise exception 'A gift quantity must be between 1 and 100000';
      end if;
    end loop;
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

  -- Options not selected any more are deactivated (rows kept: claim history).
  update public.tier_gift_options o
  set active = false, updated_at = now()
  where o.tier_id = p_tier_id
    and o.active
    and o.reward_id not in (
      select r.id from public.rewards r
      where r.store_id = v_store_id and r.catalog_gift_id = any(p_catalog_gift_ids)
    );

  -- Upsert the selection. quantity_claimed is NEVER written here, so saving
  -- can never erase or reset how many gifts were already issued.
  insert into public.tier_gift_options (
    store_id, tier_id, reward_id, active, declared_value, quantity
  )
  select v_store_id, p_tier_id, r.id, true,
    case
      when p_declared_values is null then null
      else (
        select nullif(entry.value #>> '{}', '')::integer
        from jsonb_each(p_declared_values) entry
        where entry.key::uuid = r.catalog_gift_id
        limit 1
      )
    end,
    case
      when p_quantities is null then null
      else (
        select nullif(entry.value #>> '{}', '')::integer
        from jsonb_each(p_quantities) entry
        where entry.key::uuid = r.catalog_gift_id
        limit 1
      )
    end
  from public.rewards r
  where r.store_id = v_store_id and r.catalog_gift_id = any(p_catalog_gift_ids)
  on conflict (tier_id, reward_id) do update set
    active = true,
    declared_value = excluded.declared_value,
    quantity = excluded.quantity,
    updated_at = now();
end;
$$;

revoke all on function public.save_store_gift_options(uuid, uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.save_store_gift_options(uuid, uuid[], jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. submit_customer_entry - same signature/return shape (frontend-compatible).
--    Changes vs 20261015161200:
--      * the snapshot stores the EFFECTIVE value (declared_value override or
--        catalogue voucher_value) - the issued reward's real price data;
--      * exhausted options (quantity_claimed >= quantity) are excluded from
--        the equal-probability draw and from bracket viability;
--      * a bracket whose pool is exhausted raises instead of silently falling
--        back to a legacy reward;
--      * the guarded stock increment happens only for genuinely new entries,
--        atomically (no over-issue under concurrency; retries stay idempotent).
--    Everything else is preserved verbatim: input validation, phone
--    normalization, campaign-active check, idempotent replay of an identical
--    request_id, conflicting-reuse rejection, per-phone rate limit (5/hour),
--    claim-code derivation, post-insert verification.
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
  v_option_id uuid;
  v_tier public.reward_tiers%rowtype;
  v_existing public.submissions%rowtype;
  v_phone text;
  v_claim_code text;
  v_match_count integer;
  v_effective_value integer;
  v_inserted boolean;
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
  -- the store minimum). Viable = an active gift pool with at least one option
  -- that is not exhausted, or an active legacy reward. Anything else raises
  -- rather than awarding a prize.
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
          and (o.quantity is null or o.quantity_claimed < o.quantity)
      )
      or (
        t.reward_id is not null and not exists (
          select 1 from public.tier_gift_options o where o.tier_id = t.id and o.active
        ) and exists (
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
          and (o.quantity is null or o.quantity_claimed < o.quantity)
      )
      or (
        t.reward_id is not null and not exists (
          select 1 from public.tier_gift_options o where o.tier_id = t.id and o.active
        ) and exists (
          select 1 from public.rewards r
          where r.store_id = t.store_id and r.id = t.reward_id and r.active
        )
      )
    );

  -- Equal-probability selection from the shop's approved, non-exhausted pool
  -- for this bracket. Built server-side only; the client never influences it.
  -- (Option first, then its reward row: keeps rowtype/scalar INTO targets apart.)
  select o.id into v_option_id
  from public.tier_gift_options o
  join public.rewards r
    on r.store_id = v_store.id and r.id = o.reward_id and r.active
  join public.gift_catalog g on g.id = r.catalog_gift_id and g.active
  where o.tier_id = v_tier.id and o.active
    and (o.quantity is null or o.quantity_claimed < o.quantity)
  order by random()
  limit 1;

  if v_option_id is null then
    -- Legacy fallback only for brackets WITHOUT an active pool (historical
    -- production shops keep behaving exactly as before). An exhausted pool
    -- raises instead of silently falling back to a legacy reward.
    if exists (select 1 from public.tier_gift_options o where o.tier_id = v_tier.id and o.active) then
      raise exception 'No active reward is configured for this purchase amount';
    end if;
    if v_tier.reward_id is null then
      raise exception 'No active reward is configured for this purchase amount';
    end if;
    select r.* into v_reward
    from public.rewards r
    where r.id = v_tier.reward_id and r.store_id = v_store.id and r.active;
    if not found then
      raise exception 'No active reward is configured for this purchase amount';
    end if;
    v_effective_value := v_reward.voucher_value;
  else
    select r.* into v_reward
    from public.tier_gift_options o
    join public.rewards r on r.store_id = v_store.id and r.id = o.reward_id
    where o.id = v_option_id;
    -- Effective value: the shop's declared value within platform policy, else
    -- the catalogue value. Purchase amount and gift value stay separate.
    v_effective_value := coalesce(
      (select o2.declared_value from public.tier_gift_options o2 where o2.id = v_option_id),
      v_reward.voucher_value
    );
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
    v_reward.claim_code_prefix, v_reward.validity_text, v_reward.wheel_label, v_effective_value,
    v_tier.id, v_tier.target_segment,
    v_tier.min_amount, v_tier.max_amount,
    'awaiting', p_request_id, coalesce(p_review_cta_shown, false),
    coalesce(p_review_cta_clicked, false), v_now
  )
  on conflict (id) do nothing;

  -- FOUND is true only when THIS call inserted the row; a racing duplicate of
  -- the same request_id must not consume stock twice.
  v_inserted := found;

  -- Guarded stock increment: only for genuinely new entries, and only while
  -- the option still has stock (atomic under concurrency; a lost race raises
  -- and rolls back the whole transaction, so no reward is created).
  if v_option_id is not null and v_inserted then
    update public.tier_gift_options o
    set quantity_claimed = o.quantity_claimed + 1, updated_at = now()
    where o.id = v_option_id
      and (o.quantity is null or o.quantity_claimed < o.quantity);
    if not found then
      raise exception 'No active reward is configured for this purchase amount';
    end if;
  end if;

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
-- 6. get_store_gift_pool - customer wheel labels now carry the EFFECTIVE value
--    (declared override or catalogue value), mirroring what a win would pay.
--    Display-only; the award stays in submit_customer_entry.
-- ---------------------------------------------------------------------------
create or replace function public.get_store_gift_pool(p_store_slug text)
returns table (
  tier_id uuid,
  reward_id uuid,
  gift_name text,
  wheel_label text,
  gift_description text,
  voucher_value integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.tier_id,
    r.id,
    r.name,
    r.wheel_label,
    coalesce(r.description, ''),
    coalesce(o.declared_value, r.voucher_value)
  from public.stores s
  join public.reward_tiers t on t.store_id = s.id and t.active
  join public.tier_gift_options o on o.tier_id = t.id and o.active
  join public.rewards r on r.store_id = s.id and r.id = o.reward_id and r.active
  join public.gift_catalog g on g.id = r.catalog_gift_id and g.active
  where s.slug = p_store_slug
    and s.active
    and s.status = 'active'
    and (o.quantity is null or o.quantity_claimed < o.quantity)

  union all

  select
    t.id,
    r.id,
    r.name,
    r.wheel_label,
    coalesce(r.description, ''),
    r.voucher_value
  from public.stores s
  join public.reward_tiers t on t.store_id = s.id and t.active
  join public.rewards r on r.store_id = s.id and r.id = t.reward_id and r.active
  where s.slug = p_store_slug
    and s.active
    and s.status = 'active'
    and not exists (
      select 1
      from public.tier_gift_options o
      join public.rewards pool_reward
        on pool_reward.store_id = s.id and pool_reward.id = o.reward_id and pool_reward.active
      join public.gift_catalog g on g.id = pool_reward.catalog_gift_id and g.active
      where o.tier_id = t.id and o.active
    )
  order by 1
$$;

revoke all on function public.get_store_gift_pool(text) from public;
grant execute on function public.get_store_gift_pool(text) to anon, authenticated;
