-- Wheel-label width for prize bundles (Shree Jewellers onboarding).
--
-- A coupon bundle such as "Bag + ₹1,200 Saree Coupon" cannot be represented in
-- a 1-18 char wheel label without concealing the coupon component. The reward
-- snapshot (rewards.name) already carries the complete prize; this migration
-- widens the wheel-label CHECKs so the wheel and short-label surfaces can carry
-- the complete prize too.
--
-- Compatible widening only: every existing row (<= 18 chars) remains valid, no
-- data is rewritten, and no legacy claim or reward snapshot is touched.

alter table public.rewards
  drop constraint if exists rewards_wheel_label_length;
alter table public.rewards
  add constraint rewards_wheel_label_length
  check (length(btrim(wheel_label)) between 1 and 64);

alter table public.gift_catalog
  drop constraint if exists gift_catalog_wheel_label_check;
alter table public.gift_catalog
  drop constraint if exists gift_catalog_wheel_label_length;
alter table public.gift_catalog
  add constraint gift_catalog_wheel_label_length
  check (length(btrim(wheel_label)) between 1 and 64);
