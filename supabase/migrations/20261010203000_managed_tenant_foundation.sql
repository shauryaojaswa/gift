alter table public.stores
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended', 'onboarding')),
  add column if not exists published_at timestamptz;

alter table public.submissions
  add column if not exists request_id uuid,
  add column if not exists collection_status text not null default 'awaiting'
    check (collection_status in ('awaiting', 'collected')),
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by uuid references auth.users(id) on delete set null,
  add column if not exists reward_claim_code_prefix text,
  add column if not exists reward_validity_text text,
  add column if not exists reward_wheel_label text,
  add column if not exists reward_voucher_value integer,
  add column if not exists assigned_tier_id uuid,
  add column if not exists assigned_tier_min_amount integer,
  add column if not exists assigned_tier_max_amount integer,
  add column if not exists target_segment integer;

alter table public.rewards
  add column if not exists wheel_label text,
  add column if not exists voucher_value integer check (voucher_value is null or voucher_value >= 0);

update public.rewards
set wheel_label = case upper(name)
  when 'JEWELLERY CLEANING' then 'CLEANING'
  when '₹1,000 VOUCHER' then '₹1K VOUCHER'
  when '₹2,500 VOUCHER' then '₹2.5K VOUCHER'
  when '₹5,000 VOUCHER' then '₹5K VOUCHER'
  else upper(left(name, 18))
end
where wheel_label is null or btrim(wheel_label) = '';

alter table public.rewards alter column wheel_label set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reward_tiers_target_segment_range'
  ) then
    alter table public.reward_tiers
      add constraint reward_tiers_target_segment_range check (target_segment between 0 and 7);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'rewards_wheel_label_length'
  ) then
    alter table public.rewards
      add constraint rewards_wheel_label_length check (length(btrim(wheel_label)) between 1 and 18);
  end if;
end;
$$;

create unique index if not exists submissions_store_request_id_key
  on public.submissions (store_id, request_id);
create index if not exists submissions_store_created_at_idx
  on public.submissions (store_id, created_at desc);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_paise integer not null check (price_paise >= 0),
  billing_interval text not null check (billing_interval in ('monthly', 'quarterly', 'yearly', 'custom')),
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  plan_name_snapshot text,
  monthly_price_paise integer check (monthly_price_paise is null or monthly_price_paise >= 0),
  billing_interval text check (billing_interval is null or billing_interval in ('monthly', 'quarterly', 'yearly', 'custom')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'overdue', 'waived', 'refunded')),
  started_at date,
  renewal_at date,
  trial_ends_at date,
  cancelled_at timestamptz,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.public_submission_rate_limits (
  store_id uuid not null references public.stores(id) on delete cascade,
  phone_digest text not null,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count > 0),
  primary key (store_id, phone_digest)
);

create or replace function public.audit_managed_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_store_id uuid;
  v_changed_fields text[];
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_table_name = 'submissions' then
    if (v_old ->> 'collection_status') is not distinct from (v_new ->> 'collection_status') then
      return new;
    end if;
    v_changed_fields := array['collection_status'];
  elsif tg_op = 'INSERT' then
    select array_agg(fields.key order by fields.key) into v_changed_fields
    from jsonb_object_keys(v_new) as fields(key);
  elsif tg_op = 'DELETE' then
    select array_agg(fields.key order by fields.key) into v_changed_fields
    from jsonb_object_keys(v_old) as fields(key);
  else
    select array_agg(new_field.key order by new_field.key) into v_changed_fields
    from jsonb_each(v_new) as new_field
    join jsonb_each(v_old) as old_field using (key)
    where new_field.value is distinct from old_field.value;
  end if;

  if tg_table_name = 'stores' then
    v_store_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  else
    v_store_id := coalesce((v_new ->> 'store_id')::uuid, (v_old ->> 'store_id')::uuid);
  end if;

  insert into public.platform_audit_logs (actor_id, store_id, action, details)
  values (
    (select auth.uid()),
    v_store_id,
    tg_table_name || '.' || lower(tg_op),
    jsonb_build_object('changed_fields', coalesce(to_jsonb(v_changed_fields), '[]'::jsonb))
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.is_store_campaign_active(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    left join public.store_subscriptions subscription on subscription.store_id = s.id
    where s.id = p_store_id
      and s.active
      and s.status = 'active'
      and (
        subscription.id is null
        or (
          subscription.status = 'active'
          and (subscription.renewal_at is null or subscription.renewal_at >= current_date)
        )
        or (
          subscription.status = 'trial'
          and (subscription.trial_ends_at is null or subscription.trial_ends_at >= current_date)
        )
      )
  );
$$;

create or replace function public.is_store_admin(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_admins sa
    where sa.store_id = p_store_id
      and sa.user_id = (select auth.uid())
      and public.is_store_campaign_active(sa.store_id)
  );
$$;

alter table public.stores enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_tiers enable row level security;
alter table public.submissions enable row level security;
alter table public.store_admins enable row level security;
alter table public.platform_admins enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.platform_audit_logs enable row level security;
alter table public.public_submission_rate_limits enable row level security;

grant select on public.stores, public.rewards, public.reward_tiers to anon, authenticated;
grant insert on public.stores to authenticated;
grant update (name, subtitle, logo_url, primary_color, secondary_color, google_review_url, campaign_badge, min_spin_amount)
  on public.stores to authenticated;
grant insert, update, delete on public.rewards, public.reward_tiers to authenticated;
grant select on public.submissions to authenticated;
grant select, insert, update, delete on public.store_admins to authenticated;
grant select on public.platform_admins to authenticated;
grant select, insert, update, delete on public.subscription_plans, public.store_subscriptions to authenticated;
grant select, insert on public.platform_audit_logs to authenticated;

drop policy if exists "Public can read active stores" on public.stores;
create policy "Public can read active stores"
  on public.stores for select to anon, authenticated
  using (public.is_store_campaign_active(id));
drop policy if exists "Store users can read their store" on public.stores;
create policy "Store users can read their store"
  on public.stores for select to authenticated
  using (public.is_store_admin(id) or public.is_platform_admin());
drop policy if exists "Store users can update their store" on public.stores;
create policy "Store users can update their store"
  on public.stores for update to authenticated
  using (public.is_store_admin(id) or public.is_platform_admin())
  with check (public.is_store_admin(id) or public.is_platform_admin());
drop policy if exists "Platform admins can create stores" on public.stores;
create policy "Platform admins can create stores"
  on public.stores for insert to authenticated
  with check (public.is_platform_admin());
drop policy if exists "Platform admins can delete stores" on public.stores;
-- Store data is suspended or cancelled, never deleted as a side effect of billing.

drop policy if exists "Public can read active rewards" on public.rewards;
create policy "Public can read active rewards"
  on public.rewards for select to anon, authenticated
  using (
    active and exists (
      select 1 from public.stores s
      where s.id = rewards.store_id and public.is_store_campaign_active(s.id)
    )
  );
drop policy if exists "Store users can manage own rewards" on public.rewards;
create policy "Store users can manage own rewards"
  on public.rewards for all to authenticated
  using (public.is_store_admin(store_id) or public.is_platform_admin())
  with check (public.is_store_admin(store_id) or public.is_platform_admin());

drop policy if exists "Public can read active tiers" on public.reward_tiers;
create policy "Public can read active tiers"
  on public.reward_tiers for select to anon, authenticated
  using (
    active and exists (
      select 1 from public.stores s
      where s.id = reward_tiers.store_id and public.is_store_campaign_active(s.id)
    )
  );
drop policy if exists "Store users can manage own tiers" on public.reward_tiers;
create policy "Store users can manage own tiers"
  on public.reward_tiers for all to authenticated
  using (public.is_store_admin(store_id) or public.is_platform_admin())
  with check (public.is_store_admin(store_id) or public.is_platform_admin());

drop policy if exists "Store users can read own submissions" on public.submissions;
create policy "Store users can read own submissions"
  on public.submissions for select to authenticated
  using (public.is_store_admin(store_id) or public.is_platform_admin());

drop policy if exists "Users can read own store membership" on public.store_admins;
create policy "Users can read own store membership"
  on public.store_admins for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
drop policy if exists "Platform admins can manage store membership" on public.store_admins;
create policy "Platform admins can manage store membership"
  on public.store_admins for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Platform admins can read platform administrators" on public.platform_admins;
create policy "Platform admins can read platform administrators"
  on public.platform_admins for select to authenticated
  using (public.is_platform_admin());
drop policy if exists "Platform admins can manage plans" on public.subscription_plans;
create policy "Platform admins can manage plans"
  on public.subscription_plans for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
drop policy if exists "Platform admins can manage subscriptions" on public.store_subscriptions;
create policy "Platform admins can manage subscriptions"
  on public.store_subscriptions for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
drop policy if exists "Platform admins can read audit logs" on public.platform_audit_logs;
create policy "Platform admins can read audit logs"
  on public.platform_audit_logs for select to authenticated
  using (public.is_platform_admin());
drop policy if exists "Platform admins can write audit logs" on public.platform_audit_logs;
create policy "Platform admins can write audit logs"
  on public.platform_audit_logs for insert to authenticated
  with check (public.is_platform_admin() and actor_id = (select auth.uid()));

drop trigger if exists audit_store_changes on public.stores;
create trigger audit_store_changes after insert or update or delete on public.stores
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_reward_changes on public.rewards;
create trigger audit_reward_changes after insert or update or delete on public.rewards
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_tier_changes on public.reward_tiers;
create trigger audit_tier_changes after insert or update or delete on public.reward_tiers
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_membership_changes on public.store_admins;
create trigger audit_membership_changes after insert or update or delete on public.store_admins
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_subscription_changes on public.store_subscriptions;
create trigger audit_subscription_changes after insert or update or delete on public.store_subscriptions
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_plan_changes on public.subscription_plans;
create trigger audit_plan_changes after insert or update or delete on public.subscription_plans
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_collection_changes on public.submissions;
create trigger audit_collection_changes after update of collection_status on public.submissions
  for each row execute function public.audit_managed_change();

revoke all on public.public_submission_rate_limits from anon, authenticated;
revoke insert, update, delete on public.submissions from anon, authenticated;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_store_admin(uuid) from public, anon;
revoke all on function public.is_store_campaign_active(uuid) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_store_admin(uuid) to authenticated;
grant execute on function public.is_store_campaign_active(uuid) to anon, authenticated;

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

  select count(*) into v_match_count
  from public.reward_tiers t
  join public.rewards r on r.id = t.reward_id and r.store_id = t.store_id and r.active
  where t.store_id = v_store.id and t.active
    and p_purchase_amount >= greatest(t.min_amount, v_store.min_spin_amount)
    and (t.max_amount is null or p_purchase_amount < t.max_amount);
  if v_match_count <> 1 then
    raise exception 'No unique active reward is configured for this purchase amount';
  end if;

  select t.* into v_tier
  from public.reward_tiers t
  join public.rewards r on r.id = t.reward_id and r.store_id = t.store_id and r.active
  where t.store_id = v_store.id and t.active
    and p_purchase_amount >= greatest(t.min_amount, v_store.min_spin_amount)
    and (t.max_amount is null or p_purchase_amount < t.max_amount);
  select r.* into v_reward
  from public.rewards r
  where r.id = v_tier.reward_id and r.store_id = v_store.id and r.active;

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

create or replace function public.mark_submission_collected(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
begin
  select store_id into v_store_id
  from public.submissions
  where id = p_submission_id
  for update;

  if not found
    or not (public.is_store_admin(v_store_id) or public.is_platform_admin())
  then
    raise exception 'Customer record not found';
  end if;

  update public.submissions
  set collection_status = 'collected',
      collected_at = now(),
      collected_by = (select auth.uid())
  where id = p_submission_id and collection_status = 'awaiting';

  if not found then
    raise exception 'Gift has already been collected';
  end if;
end;
$$;

revoke all on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean) from public;
revoke all on function public.mark_submission_collected(uuid) from public, anon;
grant execute on function public.submit_customer_entry(text, uuid, text, text, integer, boolean, boolean) to anon, authenticated;
grant execute on function public.mark_submission_collected(uuid) to authenticated;

create or replace function public.save_store_tiers(p_tiers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_min_spin_amount integer;
  v_tier_count integer;
begin
  if jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'Invalid tier configuration';
  end if;

  select store_id into v_store_id
  from public.store_admins
  where user_id = (select auth.uid())
  limit 1;
  if v_store_id is null or not coalesce(public.is_store_admin(v_store_id), false) then
    raise exception 'Store workspace access is not active';
  end if;

  select min_spin_amount into v_min_spin_amount
  from public.stores
  where id = v_store_id
  for update;
  if not found then
    raise exception 'Store not found';
  end if;

  select count(*) into v_tier_count
  from jsonb_to_recordset(p_tiers) as t(
    id uuid,
    min_amount integer,
    max_amount integer,
    reward_id uuid,
    target_segment integer,
    active boolean
  );
  if v_tier_count = 0 then
    raise exception 'At least one purchase tier is required';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer, reward_id uuid,
      target_segment integer, active boolean
    )
    where id is null or min_amount is null or reward_id is null
      or active is null or target_segment is null
      or min_amount <= 0
      or (max_amount is not null and max_amount <= min_amount)
      or target_segment not between 0 and 7
  ) then
    raise exception 'One or more purchase tiers have invalid values';
  end if;
  if (select count(distinct id) from jsonb_to_recordset(p_tiers) as t(
    id uuid, min_amount integer, max_amount integer, reward_id uuid,
    target_segment integer, active boolean
  )) <> v_tier_count then
    raise exception 'Purchase tier IDs must be unique';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer, reward_id uuid,
      target_segment integer, active boolean
    )
    left join public.rewards r on r.id = t.reward_id and r.store_id = v_store_id
    where r.id is null or (t.active and not r.active)
  ) then
    raise exception 'Every tier must reference a gift in this store';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer, reward_id uuid,
      target_segment integer, active boolean
    )
    where active
    group by target_segment
    having count(distinct reward_id) > 1
  ) then
    raise exception 'Different gifts cannot use the same wheel segment';
  end if;

  if not exists (
    select 1 from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer, reward_id uuid,
      target_segment integer, active boolean
    ) where active
  ) then
    raise exception 'At least one purchase tier must be active';
  end if;
  if (
    select min(min_amount) from jsonb_to_recordset(p_tiers) as t(
      id uuid, min_amount integer, max_amount integer, reward_id uuid,
      target_segment integer, active boolean
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
        id uuid, min_amount integer, max_amount integer, reward_id uuid,
        target_segment integer, active boolean
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
      id uuid, min_amount integer, max_amount integer, reward_id uuid,
      target_segment integer, active boolean
    )
    join public.reward_tiers existing on existing.id = t.id
    where existing.store_id <> v_store_id
  ) then
    raise exception 'A purchase tier belongs to another store';
  end if;

  delete from public.reward_tiers existing
  where existing.store_id = v_store_id
    and not exists (
      select 1 from jsonb_to_recordset(p_tiers) as t(
        id uuid, min_amount integer, max_amount integer, reward_id uuid,
        target_segment integer, active boolean
      ) where t.id = existing.id
    );

  insert into public.reward_tiers (
    id, store_id, min_amount, max_amount, reward_id, target_segment, active, updated_at
  )
  select t.id, v_store_id, t.min_amount, t.max_amount, t.reward_id, t.target_segment, t.active, now()
  from jsonb_to_recordset(p_tiers) as t(
    id uuid, min_amount integer, max_amount integer, reward_id uuid,
    target_segment integer, active boolean
  )
  on conflict (id) do update set
    min_amount = excluded.min_amount,
    max_amount = excluded.max_amount,
    reward_id = excluded.reward_id,
    target_segment = excluded.target_segment,
    active = excluded.active,
    updated_at = now()
  where public.reward_tiers.store_id = v_store_id;
end;
$$;

revoke all on function public.save_store_tiers(jsonb) from public, anon;
grant execute on function public.save_store_tiers(jsonb) to authenticated;

insert into storage.buckets (id, name, public)
values ('store-logos', 'store-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view store logos" on storage.objects;
create policy "Public can view store logos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'store-logos');
drop policy if exists "Store users can upload own logo" on storage.objects;
create policy "Store users can upload own logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'store-logos'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.stores s
        where s.id::text = (storage.foldername(name))[1]
          and public.is_store_admin(s.id)
      )
    )
  );
drop policy if exists "Store users can update own logo" on storage.objects;
create policy "Store users can update own logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'store-logos'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.stores s
        where s.id::text = (storage.foldername(name))[1]
          and public.is_store_admin(s.id)
      )
    )
  )
  with check (
    bucket_id = 'store-logos'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.stores s
        where s.id::text = (storage.foldername(name))[1]
          and public.is_store_admin(s.id)
      )
    )
  );
