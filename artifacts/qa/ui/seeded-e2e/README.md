# Seeded end-to-end walkthrough — `shreemanali` (staging)

Run date: 2026-10-18. Environment: **staging** (`wpytaorgiqkfnifsuhax`) via local dev
build (`localhost:5173`). Production was not touched. **The seeded test data was
deliberately left in place** (user choice) so the walkthrough can be explored and
re-run; the teardown runbook at the bottom restores staging to its prior state.

## What was tested and the result

| Area | Check | Result |
|---|---|---|
| Customer flow | Welcome → details → review → spin → reveal (₹3,000 → tier ₹1,000–4,999 → `QA Gift shreemanali A`, claim `GIFT-FB6CE702`) | ✅ |
| Customer flow | Second journey (₹7,000 → tier ₹5,000+ → `QA Gift shreemanali B`, claim `GIFT-1439A08D`) | ✅ |
| Form validation | Empty submit shows inline "Please enter your name." / "…purchase amount." / "…valid 10-digit mobile number." | ✅ |
| Review step | Skippable ("CONTINUE TO SPIN") without affecting the reward | ✅ |
| Privacy | Thank-you card masks phone (`******2001`) | ✅ |
| Logo update | Store Branding upload (`brand-assets/shree-jewellers-logo.png`, 3.6 MiB PNG) → Supabase Storage `store-logos/{storeId}/…` → public campaign page renders the real logo (fallback "SG" monogram gone) | ✅ |
| Owner dashboard | Login `manali@123`, overview aggregates (2 customers / 2 awaiting / ₹10,000) | ✅ |
| Owner dashboard | Customers table + **Mark collected** (one-way; `GIFT-FB6CE702` → green "Collected", `collected_at` + `collected_by` populated, audit trigger fires) | ✅ |
| Owner dashboard | Rewards & Tiers (immutable-claims note: past winners keep their reward) | ✅ |
| Owner dashboard | QR Code & Branding page renders + "Download QR code" | ✅ |
| Owner dashboard | Export CSV (`customers-page-1.csv`, UTF-8, 10 columns incl. Collected At/By) | ✅ |
| Resilience | Stale session of a deleted/unlinked account renders honest "account is not linked to a shop" 404 (see `owner/00-stale-session-404.png`) | ✅ |
| Role isolation | Owner account at `/platform/shops` → "Platform access required" (server-checked) | ✅ |
| Platform console | Shops roster + `shreemanali · owner: manali@123 (linked)` card state | ✅ |
| API suite | `scripts/backend-e2e.mjs` on all four shops — **37 passed, 0 failed** (auth, RLS, reward engine, validation, idempotency, rate limits, 12-way concurrency, cross-tenant isolation, collection, persistence, latency percentiles) | ✅ |

First API-suite run showed 12 failures — root cause was fixtures missing on 3 of the
4 shops (suite cascades from its first failed submission). After `qa-fixtures.mjs
prizes up` for all shops: fully green. Not a product defect.

## Snapshot gallery

- `customer/01…09` — full customer journey incl. validation errors and both bracket reveals
- `customer/10-with-logo.png` — public page with the uploaded brand logo
- `owner/00…05` — stale-session 404, login, overview, customers, collected state, rewards & tiers
- `owner/Export-customers.csv` — the exported CSV
- `platform/01-shops.png` — platform console shops roster (includes the "New shop" provisioning form with its own logo upload)
- `backend-e2e-staging.log` — full API-suite output (37/37)

Three planned states were not captured (desktop window was not in the foreground):
owner Store Branding *after* the logo upload, the QR page, and the platform
`shreemanali` card. All three are reproducible in the kept environment.

## Staging housekeeping noticed (pre-existing, not from this run)

Five leftover `Synthetic UI Shop mv*` shops from earlier `ui-verify` runs remain on
staging alongside the client shops. Consider a separate cleanup pass.

## Kept test state (all on staging only)

- QA rewards + tiers on **all four** shops (`QA Gift <slug> A/B`, ₹1,000–4,999 → A, ₹5,000+ → B)
- 2 walkthrough submissions on `shreemanali` (`GIFT-FB6CE702` collected, `GIFT-1439A08D` awaiting) + suite submissions from run tag `MVDL1PXQ`
- Uploaded brand logo on `shreemanali` (`store-logos/…`)
- Owner logins: `manali@123` (shreemanali) + `qa-pashupati*@jriq-staging.test` (other three) — passwords in `%TEMP%\jriq-staging-test-credentials.txt`
- Platform admin `qa-platform@jriq-staging.test` (same file)

## Teardown runbook (when the exploration is done)

```powershell
$K = "$env:TEMP\jriq-keys-staging.json"
node scripts/backend-e2e.mjs cleanup --env staging --keys $K      # suite submissions (run tag MVDL1PXQ)
node scripts/cleanup-seed-test.mjs                                # the 2 UI walkthrough submissions
node scripts/qa-fixtures.mjs prizes down --env staging --keys $K   # QA rewards + tiers (all shops)
# then: remove the four owner accounts + platform admin (auth admin API),
# restore the four store_owner_invitations rows to status=pending /
# owner-<slug>@jriq-onboarding.test (captured before-states in the session log),
# clear stores.logo_url + delete the store-logos/ object, stop the dev server.
```
