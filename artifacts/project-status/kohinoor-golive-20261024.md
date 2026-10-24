# Kohinoor Art Jewellers — go-live record (2026-10-24)

Owner request: "push the Kohinoor Art link live — it's there, I have worked on it."

## What went live

1. **Migration chain applied to production** (`awshkiwqkuubkhecszzk`) via the
   Management-API SQL runner (`scripts/mgmt-sql.ps1`), one file at a time,
   each verified before the next:
   - `20261017150000_gift_price_policy_and_stock.sql` — verified: `gift_catalog`
     + (`value_min`,`value_max`,`excluded_store_ids`), `tier_gift_options` +
     (`declared_value`,`quantity`,`quantity_claimed`)
   - `20261017150100_shop_config_management.sql` — verified: 4-arg
     `save_store_gift_options(p_tier_id, p_catalog_gift_ids, p_declared_values,
     p_quantities)` plus `create_shop`, `rename_store_slug`,
     `set_store_review_policy` present with the expected signatures
   - Both versions recorded in `supabase_migrations.schema_migrations`
     (confirmed rows).
2. **Store provisioned** with `scripts/seed-kohinoor.mjs --env production
   --confirm-production` (the audited, idempotent provisioning path):
   - shop: **Kohinoor** / slug `kohinoor`, id
     `7d37907b-3eb9-4401-bdad-21fcd2558067`, status **active**,
     `owner_link_status = unclaimed` (setup-pending — no fabricated owner e-mail)
   - catalogue: Jewellery Cleaning Kit (₹500, 300–1000), Silver Coin (₹2,500,
     1500–5000, declared ₹2,200), Approved Voucher (₹1,000, 500–2000)
   - pools: 11 purchase brackets × 3 gifts = 33 `tier_gift_options`
   - owner accounts: **0** (claim later via the platform surface)
   - review link: `NULL` by design (renders gracefully, never fabricated)
3. **Logo published** through `scripts/upload-store-logo.mjs` (established
   512×512 discipline from the 2026-10-19 audit F-01; source was 2048×2048,
   3.64 MB → 175,049 bytes, −95 %):
   - object `store-logos/7d37907b-3eb9-4401-bdad-21fcd2558067/
     38a5f1f5-deb6-43db-aa74-f2810dcc65b1.png`
   - sha256 `f6c751debb698bdc782f5a89b0c7e5c91b6137a163c83ae7d2200d533944b135`
     — served object verified **byte-identical** to the prepared artifact
     `artifacts/kohinoor-logo-512.png` (downloaded and hashed again at verify)
   - an intermediate upload (205 KB, regrettably a cropper-scale artifact of a
     bad resize script, sha `edb0bd29…`) was replaced and **pruned** in the same
     session; the bucket holds only the correct object.

## Live verification (Chromium, real page)

- `https://jriq.in/kohinoor` renders the customer welcome for Kohinoor
  (`Kohinoor · Spin & Win`, "YOUR REWARD IS WAITING", START CTA). Before the
  release it rendered the designed 404 ("Store kohinoor not found").
- `<img class="store-logo-image … object-contain">` loads the new storage URL,
  `naturalWidth×Height = 512×512`, `complete`.
- Console: **0 warnings / 0 errors**.
- No regression: `https://jriq.in/jolly-enterprises` still renders its own
  welcome ("CUSTOMER REWARDS · Spin & Win", same heading structure, 0 errors).

## Safety record

- Refuge work: all pre-existing uncommitted work (admin login-ID, vendor
  login rebrand, wheel duration, tests, harnesses, audit doc) committed to
  `staging` and pushed as `769c699` **before** production writes began.
- Pre-change production backup:
  - `backups/jriq/prod-func-pre-kohinoor-20261024.json` (pg_get_functiondef of
    `save_store_gift_options`, `submit_customer_entry`, `get_store_gift_pool`,
    `create_shop`, `set_store_status`, `sync_catalog_gift_to_rewards`)
  - `backups/jriq/prod-data-pre-kohinoor-20261024.json` (7 stores / 8 catalog
    gifts / 46 tiers / 8 tier options / 7 store-admin rows)
- API keys were fetched to a session temp file (`fetch-api-keys.ps1`), used,
  and deleted at the end; key values never printed.
- Write actors: temporary self-cleaning platform admin, removed at each step
  (post-state: exactly the 1 pre-existing platform admin remains).
- Tenant isolation: "exactly one shop row changed / other shops untouched"
  held on every write step (14/16 and 17/17 uploader checks, 0 failures).

## Known follow-ups (owner action, not defects)

1. Link a real owner account for Kohinoor (platform surface → drop-down shows
   setup-pending until claimed).
2. Add the Google review URL for Kohinoor when a verified listing exists
   (deliberately NULL now).
3. Other tenants' oversized logos (`shreejwellers` 3.7 MB, `jolly` 2.2 MB,
   `shreemanali` 342 KB) remain untouched per the audit's "reported, not
   changed unasked" stance.
4. The newest frontend work is NOT redeployed to jriq.in (owner chose
   "not now"); the deployed release auto-upgrades to the new schema, as verified.
