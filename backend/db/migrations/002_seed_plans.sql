-- Default subscription plans. Prices and limits are editable by the platform admin.
insert into plans (id, name, price_inr, billing_interval, trial_days, max_stores, max_submissions_per_month, csv_export, features, sort_order)
values
  ('trial', 'Free trial', 0, 'month', 14, 1, 200, false,
    '["14-day full access", "1 store", "Up to 200 entries", "QR code & standee"]'::jsonb, 0),
  ('starter', 'Starter', 499, 'month', 0, 1, 1000, false,
    '["1 store", "Configurable rewards & tiers", "QR code & standee", "Up to 1,000 entries / month"]'::jsonb, 1),
  ('growth', 'Growth', 999, 'month', 0, 1, 5000, true,
    '["1 store", "Higher submission limits", "CSV export", "Enhanced summaries", "Up to 5,000 entries / month"]'::jsonb, 2),
  ('multi_store', 'Multi-store', 2499, 'month', 0, 10, 20000, true,
    '["Multiple outlets", "Shared business overview", "Branch-specific QR codes", "Access controls", "Up to 20,000 entries / month"]'::jsonb, 3)
on conflict (id) do nothing;
