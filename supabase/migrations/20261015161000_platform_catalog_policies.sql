-- JRIQ Phase 2 migration 1 of 3: platform gift catalogue, platform policies,
-- store owner invitations, rewards.catalog_gift_id + catalogue sync trigger.
-- ADDITIVE ONLY. No drops of existing objects, no data rewrites.
-- Approved for staging per docs/MIGRATION_PROPOSAL.md (2026-10-15 execution order).

-- ---------------------------------------------------------------------------
-- 1. gift_catalog: platform-managed gift master (central catalogue)
-- ---------------------------------------------------------------------------
create table if not exists public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  wheel_label text not null check (length(btrim(wheel_label)) between 1 and 18),
  description text,
  image_url text,
  voucher_value integer check (voucher_value is null or voucher_value >= 0),
  claim_code_prefix text,
  validity_text text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. platform_policies: platform-controlled limits and defaults
-- ---------------------------------------------------------------------------
create table if not exists public.platform_policies (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_policies (key, value) values
  ('max_gift_selections_per_bracket', '4'::jsonb),
  ('default_min_spin_amount', '1000'::jsonb),
  ('default_brackets', '[
    {"min_amount": 1000,    "max_amount": 10000,   "target_segment": 0},
    {"min_amount": 10000,   "max_amount": 20000,   "target_segment": 1},
    {"min_amount": 20000,   "max_amount": 40000,   "target_segment": 2},
    {"min_amount": 40000,   "max_amount": 50000,   "target_segment": 3},
    {"min_amount": 50000,   "max_amount": 100000,  "target_segment": 4},
    {"min_amount": 100000,  "max_amount": 150000,  "target_segment": 5},
    {"min_amount": 150000,  "max_amount": 250000,  "target_segment": 6},
    {"min_amount": 250000,  "max_amount": 500000,  "target_segment": 7},
    {"min_amount": 500000,  "max_amount": 1000000, "target_segment": 0},
    {"min_amount": 1000000, "max_amount": 2000000, "target_segment": 1},
    {"min_amount": 2000000, "max_amount": null,    "target_segment": 2}
  ]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. store_owner_invitations: owner association state (pending -> linked)
-- ---------------------------------------------------------------------------
create table if not exists public.store_owner_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  status text not null default 'pending' check (status in ('pending', 'linked', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  linked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. rewards.catalog_gift_id: a shop's materialized selection of a catalogue gift
-- ---------------------------------------------------------------------------
alter table public.rewards
  add column if not exists catalog_gift_id uuid references public.gift_catalog(id) on delete restrict;

create unique index if not exists rewards_store_catalog_gift_key
  on public.rewards (store_id, catalog_gift_id) where catalog_gift_id is not null;
create index if not exists rewards_catalog_gift_idx
  on public.rewards (catalog_gift_id) where catalog_gift_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Sync trigger: the catalogue stays the single mutable source of display data.
--    Submissions keep their own immutable snapshot; this never touches them.
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
  return new;
end;
$$;

drop trigger if exists sync_catalog_gift on public.gift_catalog;
create trigger sync_catalog_gift
  after update on public.gift_catalog
  for each row execute function public.sync_catalog_gift_to_rewards();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gift_catalog_touch on public.gift_catalog;
create trigger gift_catalog_touch before update on public.gift_catalog
  for each row execute function public.touch_updated_at();
drop trigger if exists platform_policies_touch on public.platform_policies;
create trigger platform_policies_touch before update on public.platform_policies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS + grants (least privilege; platform writes enforced server-side)
-- ---------------------------------------------------------------------------
alter table public.gift_catalog enable row level security;
alter table public.platform_policies enable row level security;
alter table public.store_owner_invitations enable row level security;

grant select on public.gift_catalog to anon, authenticated;
grant insert, update, delete on public.gift_catalog to authenticated;
grant select on public.platform_policies to authenticated;
grant insert, update, delete on public.platform_policies to authenticated;
grant select, insert, update, delete on public.store_owner_invitations to authenticated;

drop policy if exists "Public can read active gifts" on public.gift_catalog;
create policy "Public can read active gifts"
  on public.gift_catalog for select to anon, authenticated
  using (active);
drop policy if exists "Platform admins can manage gift catalog" on public.gift_catalog;
create policy "Platform admins can manage gift catalog"
  on public.gift_catalog for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Authenticated can read platform policies" on public.platform_policies;
create policy "Authenticated can read platform policies"
  on public.platform_policies for select to authenticated
  using (true);
drop policy if exists "Platform admins can manage platform policies" on public.platform_policies;
create policy "Platform admins can manage platform policies"
  on public.platform_policies for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Platform admins can manage owner invitations" on public.store_owner_invitations;
create policy "Platform admins can manage owner invitations"
  on public.store_owner_invitations for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 7. Audit triggers (platform_audit_logs via existing audit_managed_change)
-- ---------------------------------------------------------------------------
drop trigger if exists audit_catalog_changes on public.gift_catalog;
create trigger audit_catalog_changes after insert or update or delete on public.gift_catalog
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_policy_changes on public.platform_policies;
create trigger audit_policy_changes after insert or update or delete on public.platform_policies
  for each row execute function public.audit_managed_change();
drop trigger if exists audit_invitation_changes on public.store_owner_invitations;
create trigger audit_invitation_changes after insert or update or delete on public.store_owner_invitations
  for each row execute function public.audit_managed_change();
