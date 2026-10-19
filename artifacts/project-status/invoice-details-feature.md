# Optional Invoice Details — Feature Implementation Report

**Feature:** Optional invoice/bill details on customer submissions, with vendor-side visibility
**Date:** 2026-10-18
**Scope:** Customer form field · persistence through the data-provider layer · vendor customer-details view + CSV
**Constraint honoured:** Nothing else changed — form layout, validation, reward logic, flow transitions, dashboards and exports are otherwise untouched.

---

## 1. Design decision

Inspection first (per requirement):

- No invoice-related field existed anywhere in the JRIQ data model. The `invoices` table listed in
  `docs/RELEASE_READINESS.md` belongs to a **different, pre-existing application** sharing the production
  database and was not reused or touched (Verified fact / source-code finding).
- The submission is written through one RPC, `submit_customer_entry`, invoked by
  `DetailsScreen.tsx` via `dataProvider.createSubmission`. Adding one **optional** argument there and one
  **nullable** column is the minimum change that keeps the write atomic and the replay/rate-limit/stock
  semantics intact (Source-code finding).

Representation: `submissions.invoice_details` — nullable text, max 200 chars.
`NULL` = "not provided". Blank/whitespace input is normalised to NULL. No upload feature introduced.

## 2. Files changed

| # | File | Change |
|---|------|--------|
| 1 | `supabase/migrations/20261018120000_invoice_details.sql` | **NEW — the documented migration.** (a) `alter table public.submissions add column invoice_details text` + length CHECK + comment; (b) `submit_customer_entry` replaced with an 8th optional arg `p_invoice_details text default null` (old 7-arg function dropped first to avoid call ambiguity; body otherwise verbatim from `20261017150000_gift_price_policy_and_stock.sql`); (c) same grants as before (`execute` → `anon, authenticated`, none for `public`). Replay-idempotency conflict rule deliberately unchanged (invoice details are auxiliary). |
| 2 | `src/lib/database.types.ts` | `submissions` Row/Insert/Update gain `invoice_details`; `submit_customer_entry` Args gain `p_invoice_details?`. |
| 3 | `src/lib/data/types.ts` | `CreateSubmissionInput.invoiceDetails?`, `SubmissionRecord.invoiceDetails?` (optional = non-breaking for existing callers/tests). |
| 4 | `src/lib/data/supabase.ts` | `createSubmission` passes `p_invoice_details` (trimmed or `null`); `listSubmissions` maps `invoice_details → invoiceDetails`. |
| 5 | `src/lib/data/local.ts` | Demo provider stores `invoiceDetails` with the record (same normalisation). |
| 6 | `src/features/customer-flow/store.ts` | Flow state gains `invoiceDetails` + `setInvoiceDetails` (session-persisted like the other fields); `recover()` defaults it to `''`. |
| 7 | `src/features/customer-flow/steps/DetailsScreen.tsx` | One optional field `INVOICE DETAILS (OPTIONAL)` with helper text *"Optional — you can continue and receive your reward without it."*; not part of validation; disabled only when fields are locked; value trimmed and passed with the submission. |
| 8 | `src/features/vendor/Customers.tsx` | Customer-details drawer row `Invoice details` (shows **"Not provided"** when absent) + CSV column `Invoice Details` appended **last** (all 10 existing columns/order preserved). |
| 9 | `src/features/customer-flow/steps/DetailsScreen.test.tsx` | **NEW** — 4 tests (field offered & marked optional; submits without invoice details; passes details through; required-field validation unchanged). |
| 10 | `src/features/customer-flow/link-surfaces.test.tsx` | **NEW** — 5 tests pinning the "base for every SaaS link" contract (canonical link builder target + all four entry paths serve the shared invoice-details form). |
| 11 | `src/lib/data/local.test.ts` | +1 test (details persist on the record and survive a fresh provider instance; absent → NULL-equivalent). |

No other files were modified by this feature. The working tree also carries **pre-existing uncommitted
Kohinoor work** (platform panels, QR deliverable, 2 earlier migrations, seed scripts) and user test edits —
all preserved untouched.

## 2b. Base for every link the SaaS issues (requirement clarification)

The invoice-details form is **the base behind every customer link originating from the SaaS** — not a
per-store or per-route variant. Verified across every link surface and every entry path:

**Link surfaces (all build the same canonical customer URL):**

| Surface | Builder | Target |
|---|---|---|
| Platform handover QR (`platform/QrDeliverable.tsx`) | `getCampaignUrl(slug)` | `https://jriq.in/{slug}` |
| Platform shop panel copy-link (`platform/ShopConfigPanel.tsx`) | `getCampaignUrl(slug)` | `https://jriq.in/{slug}` |
| Platform post-create handover (`platform/ShopsPage.tsx`) | `getCampaignUrl(slug)` | `https://jriq.in/{slug}` |
| Printable standee (`qr/Standee.tsx`) | `getCampaignUrl(slug)` | `https://jriq.in/{slug}` |
| Vendor "My QR Code" (`vendor/QRPage.tsx`) | `getCampaignUrl(slug)` | `https://jriq.in/{slug}` |
| Legacy admin "My QR Code" (`admin/MyQrCodePage.tsx`) | `getCampaignUrl(slug)` | `https://jriq.in/{slug}` |
| Printed field QR codes (already deployed) | `.htaccess`/`StoreRedirect` | 301 → `/{slug}` |

**Entry paths (all render the ONE shared form):** `/{slug}` · `/{slug}/customer` · `/{slug}/costumer`
(all → `ShopPage` → `CustomerFlow` → `StepRenderer` → `DetailsScreen`) · legacy `/store/{slug}`
(→ permanent redirect into `/{slug}`). There is no second customer form anywhere in the app —
`DetailsScreen` is the single DETAILS step.

**Pinned by regression test:** `src/features/customer-flow/link-surfaces.test.tsx` — asserts the canonical
link builder targets exactly the tested customer route (never `/admin` or `/store/`) and renders the shared
invoice-details form through **all four entry paths**, with all pre-existing fields intact.

## 3. Migration status

| Environment | Status |
|---|---|
| Repository | Written & documented (file above) — Verified fact |
| **Staging** (`wpytaorgiqkfnifsuhax`) | **Applied** via `scripts/mgmt-sql.ps1`, then verified end-to-end (below) — Verified fact |
| **Production** (`awshkiwqkuubkhecszzk`) | **NOT applied.** No production schema or data was touched. Awaiting explicit approval — Verified fact |

## 4. Verification (task checklist)

Live UI verified against `npm run dev` (demo mode: `LocalDataProvider`, banner states *"In demo mode data is
only kept in this browser"*). Real persistence verified against the **staging Supabase** backend through the
actual anon RPC + PostgREST read-back (temp scripts `%TEMP%\jriq-invoice-verify.mjs`, `jriq-invoice-verify2.mjs`).

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | Every customer-facing store link exposes the field | **PASS** | Field lives in the single shared `DetailsScreen` rendered by every `/{slug}` surface (`App.tsx` route map); live-verified on `/jolly-enterprises` **and** alias `/jolly-enterprises/costumer` (label + helper + input present). Staging RPC accepted details for two different stores (kohinoor, pashupati1). |
| 2 | Submit **without** invoice details | **PASS** | Full journey completed ("No Invoice Customer", ₹45,000 → claim `V500-D21B55`); staging RPC without the arg accepted. |
| 3 | Submit **with** invoice details | **PASS** | Full journey completed ("Invoice Test Customer", ₹1,25,000, `INV-2026-00123` → claim `V1000-405F65`); staging RPC with `INV-QA-2026-77` accepted. |
| 4 | Correct customer + store association | **PASS** | Staging read-back: rows tied to their `request_id` and to `store_id` of kohinoor / pashupati1 respectively. |
| 5 | Vendor dashboard shows saved invoice details | **PASS** | Customer-details drawer: `Invoice details → INV-2026-00123` under the correct customer (reopened after page refresh). |
| 6 | Records without details remain functional | **PASS** | Drawer shows **"Not provided"**; collection actions/status unaffected. |
| 7 | Existing submissions & workflows keep working | **PASS** | 372/372 tests green (incl. all pre-existing), `tsc -b` clean, `vite build` ✓. Full customer flow works end-to-end; mid-spin reload recovery lands on the saved REWARD (persist-first contract) — exercised live. Old rows (no `invoice_details`) list/export/drawer fine (column is nullable/optional). |
| 8 | Store-owner access restrictions intact | **PASS** | RLS unchanged (migration touches no policies). Staging `pg_policies` on `submissions`: single `SELECT` policy *"Store users can read own submissions"* (`authenticated`, store-scoped USING) — dump in `%TEMP%\jriq-rls-policies-staging.log`. Anon direct `INSERT` into `submissions` still denied (HTTP 401). Store-scoped read queries never return the other shop's invoice details (cross-checks PASS). |
| 9 | Build & regression tests pass | **PASS** | `vitest` **372/372** (29 files), `tsc -b` no errors, `vite build` ✓ 2.7s. |
| 10 | *(Clarification)* Invoice form is the base for **every** SaaS-issued link | **PASS** | All 7 link surfaces build `https://jriq.in/{slug}`; all 4 entry paths (canonical, 2 aliases, legacy printed `/store/{slug}`) render the one shared form — pinned by `link-surfaces.test.tsx` (5/5). |

### Backend checks detail (staging, all PASS)
`p_invoice_details` accepted · persisted verbatim · NULL when omitted · blank input → NULL · >200 chars
rejected by the RPC · correct store association on both tenants · tenant-scoped reads isolated both ways ·
anon direct insert denied.

## 5. Tests executed

| Suite | Result |
|---|---|
| `npx vitest run` (full) | **372 passed / 372** (29 files) — includes 10 new tests (form 4 · link-surface contract 5 · persistence 1) |
| `npx tsc -b` | Clean |
| `npm run build` | ✓ built in 2.74s |
| Live demo-mode journeys (2, with & without invoice) | Completed WELCOME→DETAILS→REVIEW→SPIN→REWARD |
| Staging RPC + read-back script | 9/9 checks PASS |
| Staging cross-store + tenant-isolation script | 7/7 checks PASS |

## 6. Remaining blockers / caveats

1. **Screenshots — blocked by environment (not by the app).** `browser.screenshot` requires a visible desktop
   window (`Screenshot needs a visible tab…`), which this environment does not provide — attempted twice
   (incl. after `tabs.focus`). **Fallback evidence:** DOM text captures of the updated customer form
   (label `INVOICE DETAILS (OPTIONAL)` + helper + input `#invoice-details`) and of the vendor
   customer-details drawer (`Invoice details → INV-2026-00123` / `Not provided`) are preserved in this
   report's verification tables and were read from the live rendered UI. Re-run `browser.screenshot` on a
   machine with a visible window to obtain image artifacts.
2. **Production migration pending approval.** Staging is migrated & verified; production deliberately left
   untouched. Applying `20261018120000_invoice_details.sql` to production + redeploying is required before
   customers see the field on live URLs.
3. **Deployed origins still run pre-feature builds** (jriq.in / GitHub Pages / old Vercel demo) — the field
   appears there only after the respective pipelines redeploy.
4. Demo-mode storage is browser-local (the app's own banner says so); persistent saving is proven on the real
   backend via staging, not inferred from browser state.

## 7. What was NOT changed (explicitly)

Form layout & styling of existing fields · validation rules for name/amount/phone · reward-tier logic,
probability draw and stock handling · flow state transitions · customer tables, filters, gift-collection
tracking · existing CSV columns/order · dashboard navigation · store settings/branding · production data.
