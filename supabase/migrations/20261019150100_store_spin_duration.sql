-- Per-store wheel animation duration
-- ============================================================
-- The spin animation is shared product behaviour pinned by tests at
-- SPIN_DURATION_MS = 5000 (release spec: the Pashupati wheel animation is
-- exactly 5 seconds). Some shops are specified differently - BCY Jewellers
-- Private Limited's release spec requires the spin to complete in
-- approximately six seconds - so the duration is overridable per store
-- without touching any other shop's experience.
--
-- NULL (the default for every existing row) = the frontend constant
-- SPIN_DURATION_MS, i.e. all existing stores keep their current animation
-- byte-for-byte. Only stores with an explicit value differ; BCY is
-- provisioned with 6000.
--
-- This is presentation timing only: the reward engine, brackets, gift pool
-- and claim flow are untouched.

begin;

alter table public.stores add column if not exists spin_duration_ms integer;

alter table public.stores drop constraint if exists stores_spin_duration_ms_check;
alter table public.stores add constraint stores_spin_duration_ms_check
  check (spin_duration_ms is null or spin_duration_ms between 1000 and 60000);

comment on column public.stores.spin_duration_ms is
  'Optional per-store spin animation duration in ms. NULL = frontend default SPIN_DURATION_MS (5000). Presentation timing only.';

-- Migration bookkeeping (safe to run via supabase db push as a no-op).
insert into supabase_migrations.schema_migrations (version, name)
values ('20261019150100', 'store_spin_duration')
on conflict (version) do nothing;

commit;
