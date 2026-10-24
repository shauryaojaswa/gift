-- Branch label for the shop-owner admin
-- ============================================================
-- A brand that runs several branches under one trade name (e.g.
-- "Pashupati (A Unit of Benaras Swarn Kala Kendra LLP)" in Vijay
-- Road, Lohta and Godowlia) needs the owner to tell the branches
-- apart INSIDE the admin. The sign-in screen and the admin badge
-- show this label next to the shop name, so /pashupati1/admin,
-- /pashupati2/admin and /pashupati/admin are visually distinct.
--
-- Additive only:
--   * the column is NULL for every existing row,
--   * nothing on the customer-facing page reads it (the customer
--     strapline stays in stores.subtitle),
--   * no existing behaviour changes for any store.
--
-- The label is plain public branch text (like the store name), never
-- a credential.

alter table public.stores add column if not exists location_label text;

comment on column public.stores.location_label is
  'Branch/location label shown in the shop-owner admin (e.g. "Vijaya Road", "Lohta", "Godowlia"). Admin-facing only - the customer-facing strapline stays in stores.subtitle.';
