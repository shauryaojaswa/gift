-- =============================================================================
-- v1.4.0 - store gift columns (8 owner-editable gifts = 8 wheel segments)
-- =============================================================================
-- Feature (BCY Jewellers Private Limited and future gift-columns shops):
--   * stores.gift_columns: the owner's EIGHT editable gift fields with their
--     draft/published state. Field i maps to wheel segment i, exactly.
--   * save_store_gift_columns: the owner's save path. Draft saves persist
--     partial work verbatim ("N of 8 gifts configured"). Publishing requires
--     all 8 fields non-empty (whitespace is empty) and replaces the live wheel
--     in ONE transaction, so the customer wheel can never show a mix of old and
--     new gifts. Nothing is invented or prepopulated: an empty field can never
--     become a prize, an assignment, or a blank segment.
--   * Free-text gift slots are materialised as `rewards` rows with
--     catalog_gift_id NULL (the platform-approved catalogue stays untouched -
--     these are the shop's own gifts, not approved catalogue entries).
--
-- Reward-engine compatibility (NO semantics change for existing shops):
--   Pool selection in submit_customer_entry / get_store_gift_pool currently
--   INNER JOINs gift_catalog, which silently drops rewards with no catalogue
--   entry. The join becomes a LEFT JOIN with an explicit
--   "catalog_gift_id is null or g.active" guard, which is provably identical
--   for every existing shop (all of their pool rewards carry catalogue ids).
--
--   The two functions are recreated from the lineage that matches the target
--   schema, chosen at apply time:
--     * production (no tier_gift_options.quantity columns - the 20261018120100
--       shim lineage) keeps its EXACT current behaviour, plus tolerance;
--     * environments with the 20261017150000 stock/price-policy chain keep
--       their stock-aware behaviour, plus tolerance.
--   This migration deliberately does NOT import the 20261017150000 reward
--   semantics (stock limits / declared values) into production - that import
--   remains its own gated release decision.
-- =============================================================================

begin;

-- 1. The eight gift fields -------------------------------------------------

alter table public.stores
  add column if not exists gift_columns jsonb;

alter table public.stores
  drop constraint if exists stores_gift_columns_shape_check;

alter table public.stores
  add constraint stores_gift_columns_shape_check
  check (
    gift_columns is null
    or (
      case
        when jsonb_typeof(gift_columns -> 'draft') = 'array'
          then jsonb_array_length(gift_columns -> 'draft') = 8
        else false
      end
    )
  );

comment on column public.stores.gift_columns is
  'Eight owner-editable gift fields ({draft: string[8], published: [{name, rewardId}]|null, publishedAt}) for gift-columns shops; null = shop uses the rewards/tier editors.';

-- 2. save_store_gift_columns ----------------------------------------------
--    Owner save path. SECURITY DEFINER + explicit store-admin check, same
--    posture as save_store_gift_options. One transaction = one atomic publish.

create or replace function public.save_store_gift_columns(
  p_store_slug text,
  p_draft text[],
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_tier public.reward_tiers%rowtype;
  v_existing jsonb;
  v_names text[];
  v_published jsonb := '[]'::jsonb;
  v_cfg jsonb;
  v_reward_id uuid;
  v_i integer;
  v_now timestamptz := now();
  v_now_iso text;
begin
  if p_store_slug is null or p_draft is null
    or coalesce(array_length(p_draft, 1), 0) <> 8 then
    raise exception 'Exactly 8 gift fields are required';
  end if;

  select * into v_store
  from public.stores s
  where s.slug = p_store_slug;
  if not found then
    raise exception 'Shop not found';
  end if;
  if not (public.is_store_admin(v_store.id) or public.is_platform_admin()) then
    raise exception 'Store workspace access is not active';
  end if;

  v_existing := v_store.gift_columns;
  v_now_iso := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Saved form: trimmed, never over the wheel-label width. Whitespace-only
  -- fields are blank fields.
  v_names := p_draft;
  for v_i in 1..8 loop
    v_names[v_i] := btrim(coalesce(v_names[v_i], ''));
    if length(v_names[v_i]) > 64 then
      raise exception 'Gift names must be 64 characters or fewer';
    end if;
  end loop;

  if not coalesce(p_publish, false) then
    -- DRAFT SAVE: persist the working copy only. Partial drafts are expected
    -- and never touch the live wheel (published stays exactly as it was).
    v_cfg := jsonb_build_object(
      'draft', to_jsonb(v_names),
      'published', coalesce(v_existing -> 'published', 'null'::jsonb),
      'publishedAt', v_existing ->> 'publishedAt'
    );
    update public.stores s
    set gift_columns = v_cfg, updated_at = v_now
    where s.id = v_store.id;
    return v_cfg;
  end if;

  -- PUBLISH GATE: all 8 fields must hold a real name. A partial configuration
  -- is never published (the previous published set stays live).
  for v_i in 1..8 loop
    if v_names[v_i] = '' then
      raise exception 'All 8 gifts must be filled before publishing (missing gift %)', v_i;
    end if;
  end loop;

  -- Slot-stable reward rows: each field keeps its reward id across republishes,
  -- so past assignments and their snapshots stay consistent.
  for v_i in 0..7 loop
    v_reward_id := nullif(
      v_existing #>> array['published', v_i::text, 'rewardId'], '')::uuid;
    v_reward_id := coalesce(v_reward_id, gen_random_uuid());

    insert into public.rewards (
      id, store_id, name, wheel_label, description,
      claim_code_prefix, validity_text, active, created_at, updated_at
    )
    values (
      v_reward_id, v_store.id, v_names[v_i + 1], v_names[v_i + 1], '',
      null, null, true, v_now, v_now
    )
    on conflict (id) do update
    set name = excluded.name,
        wheel_label = excluded.wheel_label,
        active = true,
        updated_at = excluded.updated_at;

    v_published := v_published || jsonb_build_array(
      jsonb_build_object('name', v_names[v_i + 1], 'rewardId', v_reward_id)
    );
  end loop;

  -- The shop's single bracket [min_spin_amount, +inf). Gift-columns shops are
  -- provisioned with no brackets; the bracket is created on first publish and
  -- reused afterwards.
  select * into v_tier
  from public.reward_tiers t
  where t.store_id = v_store.id and t.reward_id is null and t.max_amount is null
  order by t.created_at
  limit 1;
  if not found then
    insert into public.reward_tiers (
      id, store_id, min_amount, max_amount, reward_id,
      target_segment, active, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_store.id, v_store.min_spin_amount, null, null,
      0, true, v_now, v_now
    )
    returning * into v_tier;
  end if;

  -- Replace the bracket's gift pool with exactly the 8 published slots -
  -- atomically with the config write below (one transaction).
  delete from public.tier_gift_options o where o.tier_id = v_tier.id;
  insert into public.tier_gift_options (
    id, store_id, tier_id, reward_id, active, created_at, updated_at
  )
  select
    gen_random_uuid(), v_store.id, v_tier.id,
    (e.value ->> 'rewardId')::uuid, true, v_now, v_now
  from jsonb_array_elements(v_published) e;

  v_cfg := jsonb_build_object(
    'draft', to_jsonb(v_names),
    'published', v_published,
    'publishedAt', v_now_iso
  );
  update public.stores s
  set gift_columns = v_cfg, updated_at = v_now
  where s.id = v_store.id;
  return v_cfg;
end;
$$;

revoke all on function public.save_store_gift_columns(text, text[], boolean) from public;
grant execute on function public.save_store_gift_columns(text, text[], boolean) to authenticated;

-- 3. Pool tolerance: rewards with catalog_gift_id NULL are real prizes too ----
--    (Left join + "catalog_gift_id is null or g.active" guard. For existing
--    shops - every pool reward has a catalogue id - this is identical SQL
--    semantics to the previous inner join.)

drop function if exists public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean);

do $mig$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tier_gift_options'
      and column_name = 'quantity'
  ) then
    -- ------------------------------------------------------------------------
    -- Chain lineage (20261018120000 body) + gift-columns tolerance.
    -- Keep in sync with the branch below: the bodies are identical except for
    -- the stock/price-policy semantics that only exist on this schema.
    -- ------------------------------------------------------------------------
    execute $fn$
create or replace function public.submit_customer_entry(
  p_store_slug text,
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_purchase_amount integer,
  p_review_cta_shown boolean default false,
  p_review_cta_clicked boolean default false,
  p_invoice_details text default null
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
as $body$
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
  v_invoice text;
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

  -- invoice details: optional. Blank input means "not provided" (NULL); only
  -- an over-long value is an error. Never affects reward eligibility.
  v_invoice := nullif(btrim(coalesce(p_invoice_details, '')), '');
  if v_invoice is not null and length(v_invoice) > 200 then
    raise exception 'Invoice details are too long';
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
        left join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
        where o.tier_id = t.id and o.active and pool_reward.active
          and (pool_reward.catalog_gift_id is null or g.active)
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
        left join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
        where o.tier_id = t.id and o.active and pool_reward.active
          and (pool_reward.catalog_gift_id is null or g.active)
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
  left join public.gift_catalog g on g.id = r.catalog_gift_id
  where o.tier_id = v_tier.id and o.active
    and (r.catalog_gift_id is null or g.active)
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
    collection_status, request_id, review_cta_shown, review_cta_clicked, created_at,
    invoice_details
  )
  values (
    p_request_id, v_store.id, btrim(p_customer_name), v_phone, p_purchase_amount,
    v_reward.id, v_reward.name, v_reward.description, v_claim_code,
    v_reward.claim_code_prefix, v_reward.validity_text, v_reward.wheel_label, v_effective_value,
    v_tier.id, v_tier.target_segment,
    v_tier.min_amount, v_tier.max_amount,
    'awaiting', p_request_id, coalesce(p_review_cta_shown, false),
    coalesce(p_review_cta_clicked, false), v_now,
    v_invoice
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
$body$;
$fn$;

    execute $fn$
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
as $body$
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
  left join public.gift_catalog g on g.id = r.catalog_gift_id
  where s.slug = p_store_slug
    and s.active
    and s.status = 'active'
    and (r.catalog_gift_id is null or g.active)
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
      left join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
      where o.tier_id = t.id and o.active
        and (pool_reward.catalog_gift_id is null or g.active)
    )
  order by 1
$body$;
$fn$;

  else
    -- ------------------------------------------------------------------------
    -- Production lineage (the 20261018120100 shim body, itself verbatim from
    -- 20261015161200) + gift-columns tolerance. Reward-engine semantics stay
    -- exactly today's production behaviour.
    -- ------------------------------------------------------------------------
    execute $fn$
create or replace function public.submit_customer_entry(
  p_store_slug text,
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_purchase_amount integer,
  p_review_cta_shown boolean default false,
  p_review_cta_clicked boolean default false,
  p_invoice_details text default null
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
as $body$
declare
  v_store public.stores%rowtype;
  v_reward public.rewards%rowtype;
  v_tier public.reward_tiers%rowtype;
  v_existing public.submissions%rowtype;
  v_phone text;
  v_claim_code text;
  v_match_count integer;
  v_invoice text;
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

  -- invoice details: optional. Blank input means "not provided" (NULL); only
  -- an over-long value is an error. Never affects reward eligibility.
  v_invoice := nullif(btrim(coalesce(p_invoice_details, '')), '');
  if v_invoice is not null and length(v_invoice) > 200 then
    raise exception 'Invoice details are too long';
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
        left join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
        where o.tier_id = t.id and o.active and pool_reward.active
          and (pool_reward.catalog_gift_id is null or g.active)
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
        left join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
        where o.tier_id = t.id and o.active and pool_reward.active
          and (pool_reward.catalog_gift_id is null or g.active)
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
  -- active catalogue entries (or the shop's own free-text gifts, which carry no
  -- catalogue entry). The client can never influence it.
  select r.* into v_reward
  from public.tier_gift_options o
  join public.rewards r
    on r.store_id = v_store.id and r.id = o.reward_id and r.active
  left join public.gift_catalog g on g.id = r.catalog_gift_id
  where o.tier_id = v_tier.id and o.active
    and (r.catalog_gift_id is null or g.active)
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
    collection_status, request_id, review_cta_shown, review_cta_clicked, created_at,
    invoice_details
  )
  values (
    p_request_id, v_store.id, btrim(p_customer_name), v_phone, p_purchase_amount,
    v_reward.id, v_reward.name, v_reward.description, v_claim_code,
    v_reward.claim_code_prefix, v_reward.validity_text, v_reward.wheel_label, v_reward.voucher_value,
    v_tier.id, v_tier.target_segment,
    v_tier.min_amount, v_tier.max_amount,
    'awaiting', p_request_id, coalesce(p_review_cta_shown, false),
    coalesce(p_review_cta_clicked, false), v_now,
    v_invoice
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
$body$;
$fn$;

    execute $fn$
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
as $body$
  -- Approved pool gifts (gift options), one row per gift the shop approved for
  -- the bracket. Pool wins over any legacy reward for the same bracket.
  select
    o.tier_id,
    r.id,
    r.name,
    r.wheel_label,
    coalesce(r.description, ''),
    r.voucher_value
  from public.stores s
  join public.reward_tiers t on t.store_id = s.id and t.active
  join public.tier_gift_options o on o.tier_id = t.id and o.active
  join public.rewards r on r.store_id = s.id and r.id = o.reward_id and r.active
  left join public.gift_catalog g on g.id = r.catalog_gift_id
  where s.slug = p_store_slug
    and s.active
    and s.status = 'active'
    and (r.catalog_gift_id is null or g.active)

  union all

  -- Legacy single-gift fallback: only for brackets that have no valid pool,
  -- matching the selection order in submit_customer_entry.
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
      left join public.gift_catalog g on g.id = pool_reward.catalog_gift_id
      where o.tier_id = t.id and o.active
        and (pool_reward.catalog_gift_id is null or g.active)
    )
  order by 1
$body$;
$fn$;

  end if;
end
$mig$;

-- Same permission posture as the replaced functions.
revoke all on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean, text) from public;
grant execute on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean, text) to anon, authenticated;
revoke all on function public.get_store_gift_pool(text) from public;
grant execute on function public.get_store_gift_pool(text) to anon, authenticated;

-- 4. Migration bookkeeping (this file is also safe to run via supabase db push,
--    where the insert is a no-op).
insert into supabase_migrations.schema_migrations (version, name)
values ('20261019120000', 'store_gift_columns')
on conflict (version) do nothing;

commit;
