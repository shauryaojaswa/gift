-- =============================================================================
-- 2026-10-24 — Pashupati 10-tier reward ladder support (owner request)
-- =============================================================================
-- The approved Pashupati ladder needs 10 wheel columns and a first tier that
-- starts at ₹0. Two legacy DB constraints stand in the way:
--   * reward_tiers_min_amount_check  (min_amount > 0)   -> allow ₹0 start
--   * reward_tiers_target_segment_{check,range} (0..7)  -> allow 10 columns
-- Additive-only relaxation of the same invariants; no data or row changes.
-- Wheel rendering already supports N slices (buildWheelSegments renders
-- options.length slices when >= 8); this aligns the DB with the spec.
-- =============================================================================

ALTER TABLE public.reward_tiers
  DROP CONSTRAINT IF EXISTS reward_tiers_min_amount_check;
ALTER TABLE public.reward_tiers
  ADD CONSTRAINT reward_tiers_min_amount_check CHECK (min_amount >= 0);

ALTER TABLE public.reward_tiers
  DROP CONSTRAINT IF EXISTS reward_tiers_target_segment_check;
ALTER TABLE public.reward_tiers
  DROP CONSTRAINT IF EXISTS reward_tiers_target_segment_range;
ALTER TABLE public.reward_tiers
  ADD CONSTRAINT reward_tiers_target_segment_check CHECK (
    target_segment >= 0 AND target_segment <= 9
  );
