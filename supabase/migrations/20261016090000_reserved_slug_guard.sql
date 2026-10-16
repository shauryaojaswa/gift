-- =============================================================================
-- v1.1.0 — reserved-slug guard (database layer) + root-level customer paths
-- =============================================================================
-- ADDITIVE ONLY. Nothing here drops, deletes, or rewrites data.
--
-- What this adds:
--   1. Pre-check: refuses to run if ANY existing stores.slug is reserved
--      (expected: zero rows; jolly-enterprises is not reserved).
--   2. CHECK constraint stores_slug_reserved_check on stores.slug — the
--      database half of the reserved-slug wall. The router half lives in
--      src/lib/slugs.ts (RESERVED_SLUGS, pinned by unit tests). The two lists
--      MUST stay in sync; slugs.test.ts pins the front-end copy, this file is
--      the authoritative database copy.
--   3. create_shop replacement: rejects reserved slugs with an explicit
--      message and returns customer_path as '/' || slug (root-level shop URL)
--      instead of '/store/' || slug. Function body is otherwise identical to
--      20261015161200_reward_engine_multipool.sql.
--
-- Reserved slugs = system route segments + shipped public/ filenames:
--   system: admin, api, assets, auth, dashboard, login, platform, privacy,
--           standee, store, vendor
--   public: .htaccess, 404.html, error_pages, favicon.ico, favicon.svg,
--           icons.svg, index.html, logo-placeholder.svg, logo.svg,
--           manifest.json, robots.txt, sitemap.xml
--
-- Note: the existing pattern CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') already
-- excludes every dotted public filename; listing them here mirrors slugs.ts
-- and keeps the guard total even if the pattern check ever changes.
--
-- Rollback (SQL half only): drop constraint stores_slug_reserved_check and
-- restore create_shop from 20261015161200_reward_engine_multipool.sql.
-- Rollback (full v1.1.0): redeploy the v1.0.0 dist/ bundle — the /store/:slug
-- SPA route is restored by the old bundle; old links never broke because the
-- v1.1.0 router keeps a permanent /store/:slug redirect.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pre-check: existing rows must all pass the new constraint.
-- ---------------------------------------------------------------------------
do $$
declare
  v_offending text;
begin
  select string_agg(s.slug, ', ' order by s.slug) into v_offending
  from public.stores s
  where s.slug in (
    'admin','api','assets','auth','dashboard','login','platform','privacy',
    'standee','store','vendor',
    '.htaccess','404.html','error_pages','favicon.ico','favicon.svg','icons.svg',
    'index.html','logo-placeholder.svg','logo.svg','manifest.json','robots.txt',
    'sitemap.xml'
  );
  if v_offending is not null then
    raise exception 'Reserved-slug guard refused: existing stores use reserved slugs: %', v_offending;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Reserved-slug wall (database layer). Additive constraint.
-- ---------------------------------------------------------------------------
alter table public.stores
  add constraint stores_slug_reserved_check
  check (slug not in (
    'admin','api','assets','auth','dashboard','login','platform','privacy',
    'standee','store','vendor',
    '.htaccess','404.html','error_pages','favicon.ico','favicon.svg','icons.svg',
    'index.html','logo-placeholder.svg','logo.svg','manifest.json','robots.txt',
    'sitemap.xml'
  ));

comment on constraint stores_slug_reserved_check on public.stores is
  'v1.1.0 reserved-slug wall (DB half). Mirrors src/lib/slugs.ts RESERVED_SLUGS. System route segments and shipped public/ filenames can never be shop URLs.';

-- ---------------------------------------------------------------------------
-- 3. create_shop — identical to 20261015161200 except:
--      a) reserved slugs rejected with an explicit error before any insert;
--      b) customer_path := '/' || p_slug  (root-level shop URL, not /store/).
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
  if p_slug in (
    'admin','api','assets','auth','dashboard','login','platform','privacy',
    'standee','store','vendor',
    '.htaccess','404.html','error_pages','favicon.ico','favicon.svg','icons.svg',
    'index.html','logo-placeholder.svg','logo.svg','manifest.json','robots.txt',
    'sitemap.xml'
  ) then
    raise exception 'This URL slug is reserved by the platform';
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
    customer_path := '/' || p_slug;
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
  customer_path := '/' || p_slug;
  owner_link_status := v_status;
  return next;
end;
$$;

revoke all on function public.create_shop(text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_shop(text, text, text, text, jsonb) to authenticated;
