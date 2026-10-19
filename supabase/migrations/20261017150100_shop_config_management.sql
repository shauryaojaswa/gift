-- =============================================================================
-- v1.3.0 - shop configuration management: Google Review Link panel controls,
--          slug rename, owner-less ("setup-pending") shop creation
-- =============================================================================
-- WHY (task §4 "Central admin panel: keep my workflow simple"):
--   * "Enter and save the shop's real Google review URL ... Editing, replacing
--     and removing the URL. Validating that the input is a valid HTTPS URL
--     before saving."            -> https CHECK + trigger-side clean validation
--   * "The shop-owner dashboard may expose this setting only if the platform
--     permits the owner to manage it. Central administrator controls remain
--     authoritative."            -> stores.review_link_owner_editable + guard
--   * "View and edit the shop name, unique slug and branding" -> rename_store_slug
--     (stores.slug is outside the column-level UPDATE grant, so renames need a
--     platform-only SECURITY DEFINER RPC)
--   * "If owner details ... are missing, do not fabricate them. Allow the shop
--     to remain in a clearly identified setup-pending state" -> create_shop
--     accepts a blank owner e-mail and reports owner_link_status 'unclaimed'
--
-- Google review policy (compliance): reviews remain OPTIONAL everywhere - no
-- prize, spin or reward is ever conditional on a review, and this migration
-- touches no reward logic at all.
--
-- DATA SAFETY: both databases were audited first (staging 11/11 and
-- production 5/5 configured review URLs are https://), so the CHECK validates
-- cleanly. Additive columns + trigger + function replacements only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-shop permission: may the owner manage the review link?
--    Default true preserves existing owner behaviour exactly.
-- ---------------------------------------------------------------------------
alter table public.stores
  add column if not exists review_link_owner_editable boolean not null default true;

comment on column public.stores.review_link_owner_editable is
  'Platform-controlled: whether the shop owner may edit google_review_url';

-- Platform-only toggle (the column is outside the authenticated UPDATE grant,
-- so store admins can never flip it themselves).
create or replace function public.set_store_review_policy(
  p_store_id uuid,
  p_owner_editable boolean
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
  if p_owner_editable is null then
    raise exception 'Invalid review-link permission';
  end if;
  update public.stores s
  set review_link_owner_editable = p_owner_editable, updated_at = now()
  where s.id = p_store_id;
  if not found then
    raise exception 'Shop not found';
  end if;
end;
$$;

revoke all on function public.set_store_review_policy(uuid, boolean) from public, anon;
grant execute on function public.set_store_review_policy(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. HTTPS enforcement + owner-edit guard, server-side, for every write path
--    (platform panel, owner settings, legacy admin, direct updates).
-- ---------------------------------------------------------------------------
alter table public.stores
  drop constraint if exists stores_google_review_url_https_check;
alter table public.stores
  add constraint stores_google_review_url_https_check
  check (google_review_url is null or google_review_url ~* '^https://');

create or replace function public.guard_store_review_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.google_review_url is not null
    and new.google_review_url !~* '^https://[^[:space:]]+$' then
    raise exception 'The Google review link must be an https:// URL';
  end if;
  if tg_op = 'UPDATE'
    and new.google_review_url is distinct from old.google_review_url
    and not public.is_platform_admin()
    and not new.review_link_owner_editable
  then
    raise exception 'Only the platform administrator can change the review link';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_store_review_link on public.stores;
create trigger guard_store_review_link
  before insert or update on public.stores
  for each row execute function public.guard_store_review_link();

-- ---------------------------------------------------------------------------
-- 3. rename_store_slug - platform-only slug editing (QR/URL change is the
--    admin's explicit action; pattern, reserved-slug and uniqueness rules are
--    the table's own constraints, re-raised here with clean messages).
-- ---------------------------------------------------------------------------
create or replace function public.rename_store_slug(
  p_store_id uuid,
  p_new_slug text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform access is required';
  end if;
  v_slug := lower(btrim(coalesce(p_new_slug, '')));
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 60 then
    raise exception 'Invalid shop slug';
  end if;
  begin
    update public.stores s
    set slug = v_slug, updated_at = now()
    where s.id = p_store_id;
    if not found then
      raise exception 'Shop not found';
    end if;
  exception
    when unique_violation then
      raise exception 'That URL slug is already in use';
    when check_violation then
      raise exception 'That URL slug is reserved or invalid';
  end;
end;
$$;

revoke all on function public.rename_store_slug(uuid, text) from public, anon;
grant execute on function public.rename_store_slug(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_shop - SAME signature and result shape. One relaxation: a blank
--    owner e-mail is allowed and yields owner_link_status 'unclaimed' (the
--    clearly identified setup-pending state) with NO fabricated invitation.
--    Idempotent create, bracket template, subscription and validation rules
--    are preserved verbatim from 20261015161200.
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
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
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
      if exists (select 1 from public.store_admins sa where sa.store_id = v_store_id) then
        v_status := 'linked';
      else
        v_status := 'unclaimed';
      end if;
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

  if v_email = '' then
    -- No owner details supplied: the shop stays in the clearly identified
    -- setup-pending state. No placeholder account and no invitation is ever
    -- fabricated; the platform links a real owner later via link_store_owner.
    v_status := 'unclaimed';
  else
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
