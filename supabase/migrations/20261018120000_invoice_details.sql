-- ============================================================================
-- Optional invoice details on customer submissions
-- ============================================================================
-- Feature: customers may optionally share invoice/bill details with their
-- entry; shop owners can read them back on the customer record. Everything is
-- optional: entries without invoice details behave exactly as before.
--
-- Minimum necessary change:
--   1. submissions.invoice_details (nullable text) - one new column.
--   2. submit_customer_entry gains ONE optional argument (p_invoice_details,
--      default null) and writes the column on insert. The 7-argument function
--      is dropped first so no call can be ambiguous. All other behaviour is
--      preserved verbatim from 20261017150000_gift_price_policy_and_stock.sql:
--      input validation, phone normalization, campaign-active check, the
--      idempotent replay of an identical request_id (unchanged: invoice
--      details are auxiliary and never part of the conflict rule), the
--      conflicting-reuse rejection, the per-phone rate limit (5/hour), the
--      server-side equal-probability draw, the claim-code derivation, the
--      snapshot insert, the guarded stock increment and the post-insert
--      verification.
--
-- Access model unchanged: anon/authenticated may only call the function; the
-- submissions table stays RPC-written only, and owner reads stay scoped to the
-- owner's store by the existing RLS policy on submissions.
-- ============================================================================

-- 1. The new column (nullable = "not provided").

alter table public.submissions
  add column if not exists invoice_details text;

alter table public.submissions
  drop constraint if exists submissions_invoice_details_length_check;

alter table public.submissions
  add constraint submissions_invoice_details_length_check
  check (invoice_details is null or char_length(invoice_details) between 1 and 200);

comment on column public.submissions.invoice_details is
  'Optional invoice/bill details provided by the customer at entry time. NULL when not provided.';

-- 2. submit_customer_entry: replace with the optional p_invoice_details
--    argument. Body copied from 20261017150000 with only the invoice
--    handling added (marked "invoice details" below).

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
$$;

-- Same permission posture as the replaced function: no public execute, the
-- anonymous customer flow and signed-in users may call it.
revoke all on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean, text) from public;
grant execute on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean, text) to anon, authenticated;
