-- ============================================================================
-- PROD TRANSITIONAL SHIM (release v1.3.1, "Option B") - invoice details,
-- additive-only. NOT part of the canonical migration chain.
--
--   * submissions.invoice_details: ONE new nullable column + a length check,
--     byte-identical DDL to 20261018120000_invoice_details.sql.
--   * submit_customer_entry: production's CURRENT body (20261015161200)
--     copied VERBATIM with only the optional p_invoice_details argument and
--     its store-only handling added. Reward-engine semantics are UNCHANGED:
--     eligibility, bracket matching and pool selection are exactly today's.
--     The 7-arg signature is dropped in the same transaction so PostgREST has
--     exactly one candidate; existing 7-argument callers keep working through
--     the defaulted parameter.
--
-- Convergence: when the Kohinoor chain (20261017150000, 20261017150100) ships
-- to production, re-apply canonical 20261018120000_invoice_details.sql after
-- it - its body supersedes this shim. That is why this shim is recorded under
-- its own version 20261018120100 and the canonical 20261018120000 stays
-- unapplied (a later chain application then converges automatically).
-- ============================================================================

begin;

-- 1. additive column
alter table public.submissions
  add column if not exists invoice_details text;

alter table public.submissions
  drop constraint if exists submissions_invoice_details_length_check;

alter table public.submissions
  add constraint submissions_invoice_details_length_check
  check (invoice_details is null or char_length(invoice_details) between 1 and 200);

comment on column public.submissions.invoice_details is
  'Optional invoice/bill details provided by the customer at entry time. NULL when not provided.';

-- 2. submit_customer_entry: current body verbatim + one optional argument
drop function if exists public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean);

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
as $$
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
$$;

revoke all on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean, text) from public;
grant execute on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean, text) to anon, authenticated;

-- 3. migration bookkeeping: this shim + the two migrations that were applied
--    to production earlier but never recorded (wheel-label checks, logo
--    storage policies). Bookkeeping rows only - no DDL.
insert into supabase_migrations.schema_migrations (version, name)
values ('20261018120100', 'invoice_details_prod_compat')
on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name)
values ('20261016200000', 'wheel_label_and_display_checks')
on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name)
values ('20261017120000', 'logo_storage_policies')
on conflict (version) do nothing;

commit;
