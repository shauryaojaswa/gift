-- =============================================================================
-- v1.1.0 - inactive-notice read (database layer)
-- =============================================================================
-- ADDITIVE ONLY. Nothing here drops data or weakens an existing policy.
--
-- Requirement: a suspended (or not-yet-live) shop address must render its
-- INACTIVE page ("this campaign is not active right now"), not a 404 - and
-- submissions stay rejected backend-side (unchanged: submit_customer_entry
-- still requires an active campaign and raises 'Campaign is unavailable').
--
-- Before this migration the only public SELECT policy on stores was
-- "Public can read active stores" (using is_store_campaign_active(id)), so a
-- suspended shop's row was invisible to anon and the customer page fell
-- through to the designed not-found instead of the inactive notice.
--
-- This adds a SECOND select policy so a row-level-active shop is addressable.
-- RLS policies are OR-ed: the existing policy is untouched and still governs
-- everything else. Exposed to anon: name/subtitle/logo/branding of shops whose
-- stores.active flag is true (the same branding the customer page shows).
-- Private tables (submissions, store_admins, tier_gift_options, rewards writes)
-- are unaffected.
--
-- Rollback: drop policy "Public can read addressable stores" on public.stores.
-- =============================================================================

drop policy if exists "Public can read addressable stores" on public.stores;
create policy "Public can read addressable stores"
  on public.stores for select to anon, authenticated
  using (active);

comment on policy "Public can read addressable stores" on public.stores is
  'v1.1.0 inactive-notice read: a suspended or onboarding shop address renders its inactive page instead of 404. Existing active-stores policy untouched.';
