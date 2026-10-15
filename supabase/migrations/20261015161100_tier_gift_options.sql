-- JRIQ Phase 2 migration 2 of 3: tier_gift_options — the eligible gift pool per
-- purchase bracket (Option B: multiple approved gifts per bracket).
-- ADDITIVE ONLY. See docs/MIGRATION_PROPOSAL.md §3.2 (amended 2026-10-15).

-- Composite FK targets: rewards already has unique (store_id, id); reward_tiers
-- needs the equivalent so options can never reference another tenant's tier.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reward_tiers_store_id_key'
  ) then
    alter table public.reward_tiers
      add constraint reward_tiers_store_id_key unique (store_id, id);
  end if;
end;
$$;

create table if not exists public.tier_gift_options (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  tier_id uuid not null,
  reward_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier_id, reward_id),
  foreign key (store_id, tier_id)
    references public.reward_tiers(store_id, id) on delete cascade,
  foreign key (store_id, reward_id)
    references public.rewards(store_id, id) on delete cascade
);

create index if not exists tier_gift_options_tier_idx
  on public.tier_gift_options (tier_id);
create index if not exists tier_gift_options_store_reward_idx
  on public.tier_gift_options (store_id, reward_id);

alter table public.tier_gift_options enable row level security;

grant select, insert, update, delete on public.tier_gift_options to authenticated;

-- Pools are never readable by anon: the customer flow must not learn the
-- prize list or odds. submit_customer_entry returns only the assigned gift.
drop policy if exists "Store users can manage own gift options" on public.tier_gift_options;
create policy "Store users can manage own gift options"
  on public.tier_gift_options for all to authenticated
  using (public.is_store_admin(store_id) or public.is_platform_admin())
  with check (public.is_store_admin(store_id) or public.is_platform_admin());

drop trigger if exists tier_gift_options_touch on public.tier_gift_options;
create trigger tier_gift_options_touch before update on public.tier_gift_options
  for each row execute function public.touch_updated_at();

drop trigger if exists audit_tier_option_changes on public.tier_gift_options;
create trigger audit_tier_option_changes after insert or update or delete on public.tier_gift_options
  for each row execute function public.audit_managed_change();
