-- Seed: Jolly Enterprises store, rewards and reward tiers.
--
-- Mirrors src/lib/stores.ts exactly (same names, labels, prefixes, half-open
-- tier ranges [min, max): the RPC submit_customer_entry requires exactly one
-- active tier match, which these non-overlapping ranges guarantee).
--
-- Idempotent: safe to re-run. Run AFTER the three migrations in
-- supabase/migrations/ (in order).
--
-- The Google Review URL is intentionally NULL until configured; the customer
-- app then shows "Write a review" disabled with an honest tooltip.

insert into public.stores (
  id, slug, name, subtitle, logo_url,
  primary_color, secondary_color, google_review_url,
  campaign_badge, min_spin_amount
)
values (
  '00000000-0000-4000-a000-000000000001',
  'jolly-enterprises',
  'CUSTOMER REWARDS',
  'CUSTOMER REWARDS',
  '/assets/brand-logo.png',
  'hsl(355 85% 45%)',
  'hsl(40 80% 50%)',
  null,
  'SPIN & WIN',
  10000
)
on conflict (slug) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  logo_url = excluded.logo_url,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  google_review_url = excluded.google_review_url,
  campaign_badge = excluded.campaign_badge,
  min_spin_amount = excluded.min_spin_amount;

insert into public.rewards
  (id, store_id, name, wheel_label, description, voucher_value, claim_code_prefix, validity_text, active)
values
  ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000001',
   'Jewellery Cleaning & Polishing', 'CLEANING',
   'Professional deep cleaning and polishing of one piece of jewellery.',
   null, 'CLEAN', 'Valid for 45 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-000000000001',
   'Premium Jewellery Care Kit', 'CARE KIT',
   'A premium at-home jewellery care kit to keep your pieces sparkling.',
   null, 'CARE', 'Valid for 60 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-a000-000000000001',
   '₹500 Future Purchase Voucher', '₹500 VOUCHER',
   'A ₹500 making-charge voucher towards your next purchase.',
   500, 'V500', 'Valid for 60 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-a000-000000000001',
   'PREMIUM GIFT', 'PREMIUM GIFT',
   'A premium thank-you gift from our collection.',
   null, 'GIFT', 'Valid for 90 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-a000-000000000001',
   '₹1,000 Making-Charge Voucher', '₹1K VOUCHER',
   'A ₹1,000 voucher to savour your next celebration.',
   1000, 'V1000', 'Valid for 90 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a6', '00000000-0000-4000-a000-000000000001',
   'Premium Silver Gift', 'SILVER GIFT',
   'An elegant sterling silver keepsake from our collection.',
   null, 'SILV', 'Valid for 90 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a7', '00000000-0000-4000-a000-000000000001',
   '₹2,500 Making-Charge Voucher', '₹2.5K VOUCHER',
   'A ₹2,500 voucher towards making charges on your next luxury piece.',
   2500, 'V2500', 'Valid for 90 days from issue', true),
  ('00000000-0000-4000-a000-0000000000a8', '00000000-0000-4000-a000-000000000001',
   '₹5,000 Store Voucher / Premium Gift', '₹5K VOUCHER',
   'A ₹5,000 gold gift voucher honouring your valued loyalty.',
   5000, 'V5000', 'Valid for 90 days from issue', true)
on conflict (id) do update set
  name = excluded.name,
  wheel_label = excluded.wheel_label,
  description = excluded.description,
  voucher_value = excluded.voucher_value,
  claim_code_prefix = excluded.claim_code_prefix,
  validity_text = excluded.validity_text,
  active = excluded.active;

insert into public.reward_tiers
  (id, store_id, min_amount, max_amount, reward_id, target_segment, active)
values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-000000000001',
   10000, 20000, '00000000-0000-4000-a000-0000000000a1', 0, true),
  ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-000000000001',
   20000, 40000, '00000000-0000-4000-a000-0000000000a2', 1, true),
  ('00000000-0000-4000-b000-0000000000b3', '00000000-0000-4000-a000-000000000001',
   40000, 50000, '00000000-0000-4000-a000-0000000000a3', 2, true),
  ('00000000-0000-4000-b000-0000000000b4', '00000000-0000-4000-a000-000000000001',
   50000, 100000, '00000000-0000-4000-a000-0000000000a4', 3, true),
  ('00000000-0000-4000-b000-0000000000b5', '00000000-0000-4000-a000-000000000001',
   100000, 150000, '00000000-0000-4000-a000-0000000000a5', 4, true),
  ('00000000-0000-4000-b000-0000000000b6', '00000000-0000-4000-a000-000000000001',
   150000, 250000, '00000000-0000-4000-a000-0000000000a6', 5, true),
  ('00000000-0000-4000-b000-0000000000b7', '00000000-0000-4000-a000-000000000001',
   250000, 500000, '00000000-0000-4000-a000-0000000000a7', 6, true),
  ('00000000-0000-4000-b000-0000000000b8', '00000000-0000-4000-a000-000000000001',
   500000, null, '00000000-0000-4000-a000-0000000000a8', 7, true)
on conflict (id) do update set
  min_amount = excluded.min_amount,
  max_amount = excluded.max_amount,
  reward_id = excluded.reward_id,
  target_segment = excluded.target_segment,
  active = excluded.active;
