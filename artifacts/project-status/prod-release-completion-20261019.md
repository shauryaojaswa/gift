# Production Release Completion — v1.3.2

**Date:** 2026-10-19
**Target:** `https://jriq.in` (production project `awshkiwqkuubkhecszzk`)
**Scope:** Invoice-details feature (already shipped with v1.3.1) + the production↔frontend
gift-options compatibility fix (the remaining deliverable) + end-to-end verification of both.
**Outcome:** Shipped and verified. `byte-verify` 52/52, full test suite 426/426, all live
production checks pass. No production schema changes were required or made.

---

## 1. Release scope and isolation

**In scope (shipped in this release bundle):**

| Area | Change |
|---|---|
| `src/features/platform/api.ts` | Compatibility layer: schema-capability probes, capability-gated reads/writes for optional gift columns, RPC-shape fallback for `save_store_gift_options`, blank-entry pruning (`pruneOptionalNumbers`) |
| `src/features/platform/GiftPoolPanel.tsx` | Availability toggle and quantity input gated on detected schema support |
| `src/features/platform/CatalogPage.tsx` | Price-policy fields (`Value policy`) rendered only when the columns exist |
| `src/features/platform/api-compat.test.ts` | New: 15 compatibility tests (probes, both schema generations, RPC retry, wire-contract pruning) |
| `src/features/platform/GiftPoolPanel.test.tsx` | Extended: legacy-schema rendering suite |
| `scripts/invoice-staging-check.mjs` | Staging-only invoice write-verification (10 checks, self-cleaning) |
| `scripts/invoice-ui-fixtures.mjs` | Staging-only fixture creator for the vendor view/CSV check (self-cleaning) |

**Explicitly out of scope / preserved:**

- All pre-existing uncommitted working-tree changes (gift price policy/stock, shop config
  management, Kohinoor work, `src/lib/gift-columns.ts`, `src/features/vendor/GiftColumnsPanel.tsx`,
  user test edits, `artifacts/`, `logs/`) were left untouched and are part of the tree the
  release was built from, exactly as v1.3.1 was.
- No migration was applied to production. The production migration history was already
  reconciled (14 rows: backfills `20261016200000`, `20261017120000` + the invoice compat shim
  `20261018120100_invoice_details_prod_compat`, see
  `prod-compat-invoice-details-20261018120100.sql`).
- The Kohinoor migration chain (`20261017150000_gift_price_policy_and_stock`,
  `20261017150100_shop_config_management`) was **not** applied to production; it remains future
  work. Reward-engine behaviour on production is byte-for-byte what it was before the release.

## 2. The compatibility gap and the fix

### What was broken (re-verified live before the fix)

| Surface | Production symptom | Root cause |
|---|---|---|
| Vendor/Platform Rewards & Tiers | HTTP 400, panel stuck loading | SQL `42703 column tier_gift_options_1.declared_value does not exist` — the pool query selected columns from the post-`20261017150000` schema that production does not have |
| Gift-option save | HTTP 404 | `PGRST202 Could not find the function public.save_store_gift_options(...)` — frontend called the 4-argument signature, production deploys only the 2-argument one |

Production schema (probe-confirmed 2026-10-19): `save_store_gift_options(p_tier_id uuid,
p_catalog_gift_ids uuid[])` only; `gift_catalog` without `value_min/value_max/excluded_store_ids`;
`tier_gift_options` without `declared_value/quantity/quantity_claimed`; `stores` without
`review_link_owner_editable`; `submit_customer_entry` **is** the 8-argument invoice version
(shim `20261018120100` applied 2026-10-19).

### Fix design (smallest safe change, chosen per the approved preference order)

**Frontend backward-compatibility with the deployed production RPCs. Zero production schema
change → reward behaviour untouched.**

1. **Capability probes** (`fetchGiftSchemaSupport`): one 1-row `limit=1` select per optional
   column, cached per client. A 400 on a probe is swallowed and recorded as "unsupported".
2. **Capability-driven reads:** `listTiersWithPools` selects only columns that exist and
   normalizes missing fields to their documented defaults (`declaredValue ?? null`,
   `quantity ?? null`, `quantityClaimed ?? 0`). `listCatalog` normalizes `valueMin/valueMax`.
3. **Capability-gated writes:** `createCatalogGift`/`updateCatalogGift` omit unsupported
   optional columns (an all-optional patch early-returns without a write).
4. **RPC-shape fallback:** `saveGiftOptions` calls the shape matching the detected schema
   generation first and retries the other shape only on `PGRST202` ("Could not find the
   function"). Any other server error is surfaced verbatim — price policy, count and
   availability violations keep their exact messages.
5. **UI gating:** quantity input and the availability toggle render only when supported; the
   price-policy fields on the catalog page render only when the columns exist.

On production the layer deterministically selects the 2-argument save and the legacy column
sets. When the Kohinoor chain is eventually applied, the same build automatically starts using
the richer shape with no further frontend change.

### Wire-contract defect found during staging verification and fixed

The staging pass caught a real defect in the release scope, invisible on production (its 2-argument
save ignores the maps entirely): the panel sent explicit `null` entries for every blank
declared-value/quantity input, but `save_store_gift_options` (post-`20261017150000`) validates
every map entry as a whole number and raises **"A gift value must be a whole number"** on JSON
`null`. Fixed at the API boundary (`pruneOptionalNumbers`): blank/NaN entries travel as
**omission**, which the server documents and implements as "catalogue default / unlimited"
(the upsert resets the stored override when the key is absent). Pinned by two new tests.

## 3. Quality gates (final state)

| Gate | Result |
|---|---|
| Full unit suite (`vitest run`, 35 files) | **426/426 passed** |
| Platform compatibility suite | **46/46 passed** (incl. 15 `api-compat` tests) |
| `preflight:root` with production env | **11/11 passed** (lint, tests, typecheck + build, secret scan, dist key classification — anon only, base path, SPA fallback) |
| `byte-verify dist https://jriq.in` (post-deploy) | **52/52 byte-identical** |

## 4. Staging verification (project `wpytaorgiqkfnifsuhax`, all DB writes staging-only)

1. **Invoice omitted → `NULL`** persisted. ✅
2. **Invoice `INV-2026-00123`** persisted verbatim. ✅
3. **Blank/whitespace → `NULL`.** ✅
4. **201 chars rejected** ("Invoice details are too long"); **200 chars accepted.** ✅
5. **Legacy 7-key submission shape** (no invoice key) still works. ✅
6. **Reward assignment unchanged** — drawn from the configured pool for the bracket. ✅
   (`scripts/invoice-staging-check.mjs`: **10/10**, 5 synthetic rows cleaned up.)
7. **Vendor invoice view + CSV:** created two real submissions (with/without invoice) via the
   customer RPC; vendor Customers drawer showed `INV-QA-77881` vs **`Not provided`**; exported
   CSV header ended with **`Invoice Details`** (final column) with correct per-row values.
   Both fixture rows deleted afterwards.
8. **Rewards & Tiers (rich schema):** loads with **zero failed REST requests**; value policy
   shown ("Value policy: ₹500 – ₹2,000"); quantity inputs render.
9. **Gift-option save (rich 4-argument path):** mixed selection (value 1200 + quantity 5 + one
   gift left blank) → `POST 204` + notice. **DB read-back exact:** voucher
   `declared_value=1200, quantity=5`; blank gift `declared_value=NULL, quantity=NULL`;
   `quantity_claimed` preserved (never reset by a save). This is the run that exposed and
   then proved the fix for the null-entry defect above.
10. **Regression suite (`scripts/backend-e2e.mjs`):** 35 passed / 2 failed (S2, C3). The two
    failures are **stale fixture drift**, not regressions: the assertions expect legacy
    placeholder gift names (`QA Gift shreemanali B`) while shreemanali now has a real reward
    ladder; the engine returned the correct bracket's real reward ("Rs 500 off on next
    purchase", tier 5,000–10,000). Read-only queries confirmed correct bracket and
    per-shop reward. Documented as a known non-blocker.

**Staging migration history reconciled** (bookkeeping): the 5 migrations that had been applied
without history rows (`20261016200000`, `20261017120000`, `20261017150000`, `20261017150100`,
`20261018120000`) were first **proven present** (constraints, fixed storage policies,
columns, 4-argument save, `rename_store_slug`, `set_store_review_policy`, invoice column and
8-argument submit all probe-confirmed), then recorded. History is now contiguous through
`20261019120000` (17 rows). Production required no reconciliation.

## 5. Deployment record

1. Built with production env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_PUBLIC_APP_URL=https://jriq.in`) via `preflight:root` (11/11 at 2026-10-19).
2. Delta against live computed with `byte-verify`: **27 changed files** (26 new hashed assets +
   `index.html`); the shared-module change cascaded hashes through the chunk graph as expected.
   `.htaccess` was identical and was **not** uploaded (preserved untouched).
3. Upload order via mPanel File Manager automation (`mpanel-upload.ps1`, credentials read from
   the local protected file, never printed): 26 assets → `public_html/assets` (4 chunks × 201),
   then `index.html` → `public_html` **last**. Old chunks were left on the server (not deleted),
   no unrelated hosting files touched, identical assets not re-uploaded.
4. `node scripts/byte-verify.mjs dist https://jriq.in` → **RESULT 52 byte-identical, 0 failed**.

## 6. Live production verification (all against `https://jriq.in`)

### Customer journeys (real submissions, kept and documented — see §7)

| # | Store | Invoice | Result |
|---|---|---|---|
| 1 | `shreejwellers` (Shree Jewellers) | `INV-REL-2026-A` | Full journey: details → review → spin → **YOU WON "Bag + ₹1,200 Saree Coupon", claim `BAG-62227CB9`** → thank-you (name/amount/reward/masked phone/claim shown) |
| 2 | `shreemanali` (Shree Manali Ethnic Galore) | omitted | Full journey → **"Mobile Charm", claim `GIFT-5551C54F`** → thank-you |
| 3 | `shreemanali` | `INV-REL-2026-B` | Customer RPC path (same anonymous RPC the page calls) → claim `GIFT-7A9CCF98` |

- The live customer form carries **"Invoice details (optional)"** on every path.
- DB read-back: journey 2's `invoice_details` is **`NULL`** (omitted → NULL contract live).
- Note on journey 1: the automation desktop window was hidden, which suspends
  `requestAnimationFrame` and stalled the wheel animation mid-spin (environment artifact, same
  as previously documented). The journey completed through the product's own reload-recovery
  (`recover()` in `src/features/customer-flow/store.ts` jumps to the reward screen when the
  reward is already persisted). Journey 2 used a timer-backed frame clock and ran the real
  spin animation end-to-end.

### Review surfaces

- **Distinct sentence sets, verbatim:** jewellery (10 sentences, e.g. "I really liked the
  jewellery designs.", "The collection had many beautiful options.") vs clothing (10
  sentences, e.g. "Loved the ethnic wear collection — so many beautiful options.", "The fabric
  and stitching quality of my outfit is excellent."). Topic chips (Quality, Price, Shopping
  Experience, My Visit) render on both.
- **Store-specific Google links:** `shreejwellers` → Google place `…0xebcd9fadee301ec` /
  `ludocid=1061963283657064940`; `shreemanali` → `…0x3f5167e78b4150a7` (`kgmid=/g/11btwrcb9h`).
  Distinct per store ✅.
- **Copy / open / skip usable:** clicking a sentence wrote it verbatim to the clipboard
  (`The service was warm and helpful throughout my visit.`) and showed the "Copied" feedback;
  the Google click resolves to the store's own link; "Skip for now" advances the flow. The
  reward copy states reviews never affect the reward.

### Invoice behaviour (vendor side, production)

- Vendor Customers drawer: journey 2 → **"Invoice details: Not provided"**; journey 3 →
  **"Invoice details: INV-REL-2026-B"**. ✅
- Exported CSV header: `Customer,Phone,Purchase Amount (INR),Bracket,Reward,Claim Code,Status,
  Submitted,Collected At,Collected By,Invoice Details` — **Invoice Details is the final
  column**; values `INV-REL-2026-B` and empty respectively. ✅
- Journey rows show correct bracket (`₹1,000 – ₹4,999` for ₹3,000) and reward.

### Cross-tenant isolation

- The vendor Customers list and CSV contain **no** `shreejwellers` record.
- Direct REST probe with the owner's own session token (anon key sourced in-page from the
  public bundle; no key material printed): own-store record → **1 row**; the other store's
  record → **0 rows** (same query, no store filter) — RLS excludes cross-tenant data;
  unfiltered select returns only the owner's store rows.

### Rewards & Tiers on the deployed 2-argument backend (the compat fix)

- Page loads and renders fully — **the former 400 (`declared_value does not exist`) is gone**.
- Live network trace shows the compatibility layer working exactly as designed: four
  swallowed capability probes (`tier_gift_options?select=declared_value`, `?select=quantity`,
  `gift_catalog?select=value_min`, `?select=excluded_store_ids` → 400) followed by a **200**
  capability-driven `reward_tiers?select=*,rewards(name),tier_gift_options(...)` and
  `gift_catalog?select=*`.
- Legacy-mode rendering: **zero quantity inputs**, no price-policy fields (rich-only UI hidden).
- **Gift-save:** zero-selection save on the `₹1 – ₹1,000` bracket → notice "Saved gift options
  for ₹1 – ₹1,000." and `POST 204 rpc/save_store_gift_options` against the deployed
  2-argument signature. Ground truth before and after is **identical** (zero gift-option rows —
  the panel's all-unchecked state matched the DB, and the store's draws come from its reward
  ladder), i.e. **no reward behaviour change**. Selection-bearing saves on the 4-argument
  signature are covered by the staging verification (§4.9).

## 7. Test records created

**Production (KEPT — nothing deleted, per the verification policy):**

| id | name | phone | amount | invoice | claim | status |
|---|---|---|---|---|---|---|
| `62227cb9-e0ed-4c1f-ba87-b3e5bef64a41` | Release Verify Jewellery | 7051207754 | ₹5,000 | `INV-REL-2026-A` | `BAG-62227CB9` | awaiting |
| `5551c54f-37d4-4a11-9daf-12d984f3ba59` | Release Verify Ethnic | 7001714935 | ₹3,000 | `NULL` | `GIFT-5551C54F` | awaiting |
| `7a9ccf98-5345-478a-bcbb-7c71c652160d` | Release Verify Invoice | 7063645789 | ₹3,000 | `INV-REL-2026-B` | `GIFT-7A9CCF98` | awaiting |

**Staging (created and deleted):** 5 rows from `invoice-staging-check`, 2 rows from the vendor
UI/CSV check (`788a561e-…`, `7550a44c-…`). All removed; no staging residue.

## 8. Schema / RPC matrix (probe-confirmed 2026-10-19)

| Object | Production | Staging | Frontend behaviour |
|---|---|---|---|
| `submit_customer_entry` | 8-arg (invoice) | 8-arg | Invoice field active on both |
| `save_store_gift_options` | 2-arg only | 4-arg | Calls deployed shape first; retries other on `PGRST202` |
| `gift_catalog.value_min/value_max/excluded_store_ids` | absent | present | Price-policy/availability UI hidden on prod |
| `tier_gift_options.declared_value/quantity/quantity_claimed` | absent | present | Value shown as fixed; quantity UI hidden on prod |
| `stores.review_link_owner_editable`, `rename_store_slug`, `set_store_review_policy` | absent | present | ShopConfigPanel remains platform-only (documented residual) |
| `submissions.invoice_details` + length CHECK | present (shim `20261018120100`) | present | Verified live both environments |
| Migration history | 14 rows, reconciled | 17 rows, reconciled this release | — |

## 9. Backup and rollback

- Backup taken before the invoice DB work (v1.3.1 release): `jwellery-2026-10-19-003847.dump`.
- This release made **no** production schema or data changes, so rollback is frontend-only:
  re-upload the previous hashed assets and the previous `index.html` (still present on the
  server — old chunks were deliberately not deleted) and re-run `byte-verify`.

## 10. Known non-blockers and residuals

1. **`backend-e2e` S2/C3 fixture drift** (staging): assertions expect legacy placeholder gift
   names; the engine returns shreemanali's real reward ladder entries. Correct behaviour
   confirmed; fixtures need an update in a future maintenance pass.
2. **ShopConfigPanel platform-only RPCs** (`set_store_review_policy`, `rename_store_slug`) are
   not deployed on production (Kohinoor chain not applied). Out of this release's scope; the
   panels remain platform-only as documented in `known-risks.md`.
3. **CatalogPage price-policy fields** are hidden on production by the capability gate; this
   branch is covered by unit tests and the staging rich-path run, not by a live platform-admin
   session (no platform-admin credentials were available to this release session).
4. **Hidden-window `requestAnimationFrame` throttling** stalls wheel animations in automated
   background windows (environment artifact, previously documented). The product's reload
   recovery handles interrupted spins correctly (verified live).
5. The Kohinoor migration chain remains future work; when applied, the shipped frontend will
   automatically adopt the 4-argument save and the extended columns with no code change.

## 11. Evidence index

| Evidence | Location |
|---|---|
| v1.3.1 release report (invoice feature ship) | `docs/V1.3.1_RELEASE_REPORT.md` |
| Production invoice compat shim (applied) | `artifacts/project-status/prod-compat-invoice-details-20261018120100.sql` |
| Compatibility layer + tests | `src/features/platform/api.ts`, `api-compat.test.ts`, `GiftPoolPanel.tsx`, `GiftPoolPanel.test.tsx`, `CatalogPage.tsx` |
| Staging invoice write-check (10/10) | `scripts/invoice-staging-check.mjs` |
| Staging UI fixtures | `scripts/invoice-ui-fixtures.mjs` |
| Regression suite (35/37, S2/C3 drift) | `scripts/backend-e2e.mjs` |
| Deploy verification | `scripts/byte-verify.mjs` (52/52), `scripts/preflight.mjs` (11/11) |
| DB probes (staging + prod) | `scripts/mgmt-sql.ps1` runs on 2026-10-19 (read-only probes + staging bookkeeping) |
| Backup | `jwellery-2026-10-19-003847.dump` |

---

*Release bundle: current working tree (including the preserved parallel work) built with the
production environment; live entry `assets/index-Dh4HqAXG.js`; every shipped byte verified
identical on `https://jriq.in`.*
