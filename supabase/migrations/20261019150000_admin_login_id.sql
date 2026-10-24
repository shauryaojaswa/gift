-- Admin login IDs: shop name as the login ID
-- ============================================================
-- Supabase Auth (GoTrue) remains the ONLY credential store: e-mail + password
-- hash stay in auth.users and passwords are only ever set through the auth
-- provider. This migration adds *username-to-account resolution on the
-- backend*: the sign-in form may accept a shop name such as "BCY Jewellers
-- Private Limited", and resolve_admin_login() maps that login ID to the auth
-- account's e-mail so the existing signInWithPassword flow proceeds unchanged.
--
-- Nothing secret is stored here: a login ID is public branding text (exactly
-- like the e-mail addresses already used as login IDs), and no credential is
-- placed in application tables, source code, browser storage, or logs. The
-- frontend never hardcodes any mapping - it only calls this RPC.
--
-- Compatibility: additive only. store_admins.login_id is NULL for every
-- existing row (unique partial index ignores NULLs), no behaviour changes for
-- any existing store, and e-mail logins keep working without the RPC at all.

begin;

-- 1. Per-membership login ID -------------------------------------------------
alter table public.store_admins add column if not exists login_id text;

-- One login ID per membership, case-insensitive; NULL keeps all rows unique-free.
create unique index if not exists store_admins_login_id_key
  on public.store_admins (lower(btrim(login_id)))
  where login_id is not null and btrim(login_id) <> '';

-- 2. Backend resolution: login ID -> auth e-mail -----------------------------
create or replace function public.resolve_admin_login(p_login_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sa.email
  from public.store_admins sa
  where sa.login_id is not null
    and btrim(sa.login_id) <> ''
    and lower(btrim(sa.login_id)) = lower(btrim(coalesce(p_login_id, '')))
  limit 1;
$$;

comment on function public.resolve_admin_login(text) is
  'Maps an admin login ID (e.g. the shop name) to the auth account e-mail for sign-in. Exact, case-insensitive match on store_admins.login_id; NULL when unknown. Returns only the e-mail address that signInWithPassword accepts.';

revoke all on function public.resolve_admin_login(text) from public;
grant execute on function public.resolve_admin_login(text) to anon, authenticated;

-- 3. Migration bookkeeping (safe to run via supabase db push as a no-op).
insert into supabase_migrations.schema_migrations (version, name)
values ('20261019150000', 'admin_login_id')
on conflict (version) do nothing;

commit;
