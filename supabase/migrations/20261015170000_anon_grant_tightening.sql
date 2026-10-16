-- Defence-in-depth grant tightening (staging review finding, 2026-10-15):
-- Supabase default table privileges grant anon at CREATE TABLE time. RLS already
-- prevents row access (no anon policies exist), but the project convention is to
-- revoke explicitly as well (see public_submission_rate_limits in
-- 20261010203000_managed_tenant_foundation.sql).
-- ADDITIVE ONLY: grants/revokes, no schema or data changes. Customer-facing anon
-- reads on stores/rewards/reward_tiers/gift_catalog(active) remain available.

revoke all on public.platform_policies from anon, public;
revoke all on public.store_owner_invitations from anon, public;
revoke all on public.tier_gift_options from anon, public;
revoke all on public.platform_admins from anon, public;
revoke insert, update, delete on public.gift_catalog from anon, public;

-- Reaffirm the intended authenticated grants (RLS remains the enforcement layer).
grant select on public.platform_policies to authenticated;
grant select, insert, update, delete on public.store_owner_invitations to authenticated;
grant select, insert, update, delete on public.tier_gift_options to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.gift_catalog to anon, authenticated;
grant insert, update, delete on public.gift_catalog to authenticated;
