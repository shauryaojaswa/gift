# Pashupati — three stores: end-to-end verification report

Date: 2026-10-18 (runs 23:0x IST)
Scope: `pashupati1`, `pashupati2`, `pashupati` on the live origin **https://jriq.in** (production).
Harness: `scripts/pashupati-e2e.mjs` (config + journey phases) — every number below is from runs executed in this session.

## Headline

- **Configuration matrix: 21/21 PASS** (3 stores × 7 checks) — gifts/brackets persisted, order preserved,
  per-store independence verified against the database.
- **Journeys: 76 passed / 12 failed / 2 external-blocked** across 6 customer runs (2 per store).
  All 12 failures collapse to **two live-bundle defects**, both already fixed in the working tree
  and unit-verified, but **not yet deployable** (see "Deploy gate").
- **Unit suite: vitest 372/372 (29 files) green** — nothing broken; assistant, wheel-landing and
  reward-editor logic covered.

## What "store configuration" looks like (identical architecture, per-store data)

Each store carries the same approved 8-gift jewellery ladder / 8 purchase brackets (jolly-enterprises'
approved rows), configured individually through its own vendor admin (`/{slug}/admin` → Campaign panel,
gift by gift), and its own location-specific Google review destination:

| store | id | status | gift ladder | brackets | google_review_url |
|---|---|---|---|---|---|
| pashupati1 | `eb2c608c-0248-4127-ad26-8b634ecef0a1` | active | 8/8 | 8/8 | primary BSKK listing (own CID `0x96988d31a11155ac`) |
| pashupati2 | `1842b881-1b8c-45e7-a5bf-553bddf0e597` | active | 8/8 | 8/8 | Lohta listing (own CID `0x5e7aa4810675d71f`) |
| pashupati | `da8b52d7-d227-414d-9965-bb8606054d6c` | active | 8/8 | 8/8 | **NULL — by design** (no verified listing exists for the third location; `onboard-clients.mjs`: "Never assign another branch's Google listing to this slug") |

## Per-store results

### pashupati1 — config 7/7 · journey 26 passed / 5 failed / 1 blocked

| area | result |
|---|---|
| owner config: gifts column-by-column, save, refresh, persist | **PASS** (7/7: persistence after refresh, DB read-back names/fields, bracket order 0..7, independence vs pashupati2 + pashupati) |
| customer page wheel = saved vendor config, in order | **PASS** (8 columns match the configured ladder in bracket order) |
| reward consistency (wheel stop + reveal vs reward engine) | **PASS** — stop on assigned column, reveal name, claim code = backend `coupon_code`, amount matched, backend `reward_label` cross-check, both runs |
| review topics (identical across stores) | **PASS** — chips = `All, Service, Collection, Staff, Quality, Price, Shopping Experience, My Visit` |
| review sentences (approved jewellery set) | **FAIL → F1** — live serves clothing set |
| copy a recommendation = only the review text | **FAIL → F1** (content = wrong set) + copy confirmation (headless clipboard) |
| one-click / Open Google = own location link | **PASS** (destination verified = own CID) + **BLOCKED-external** (Google `/sorry/` interstitial in headless) |
| skip the review | **PASS** ("Skip for now" closes and continues; run 2 skip path completes) |
| wheel duration 5–6 s | **FAIL → F2** (measured 7294–7464 ms = live 7000 ms spin) |

### pashupati2 — config 7/7 · journey 26 passed / 5 failed / 1 blocked

Identical pattern to pashupati1: all persistence/order/independence/reward-consistency/skip/link checks
**PASS** with its own Lohta destination (own CID verified in the interstitial `continue=`), the same
**F1** sentence failures and **F2** duration failures (measured 7407–7522 ms).

### pashupati — config 7/7 · journey 24 passed / 2 failed / 0 blocked

| area | result |
|---|---|
| config (gifts/brackets/persistence/order/independence) | **PASS** 7/7 |
| no review URL saved → CTA disabled, **never another branch's link** | **PASS** (both runs) |
| skip path stays available without a review link | **PASS** (both runs) |
| wheel columns = saved vendor config in order | **PASS** (both runs) |
| reward consistency (stop/reveal/claim/backend) | **PASS** (both runs) |
| wheel duration 5–6 s | **FAIL → F2** (7524–7656 ms) |

Its review CTA is correctly disabled because **no verified Google listing exists for the third
location** — the correct per-location behavior; opening a review page here would require the owner's
actual listing URL (not in our records; must not be invented).

## Findings and fixes

### F1 — live bundle serves clothing review sentences on jewellery stores (3 failures × pashupati1/2)
The deployed `CustomerFlow` chunk hardcodes a single clothing sentence list
(`The service was warm and helpful throughout my visit.` … , single `topic:` mapping) instead of the
approved jewellery set. The approved topics themselves are correct live (chip check passes).
**Fix (ready, unit-verified):** `src/lib/review-recommendations.ts` (committed) +
`src/components/ui/GoogleReviewAssistant.tsx` wiring (`reviewSetFor(slug)` → `JEWELLERY_SET` default,
the ten approved sentences verbatim, identical across all three stores). `GoogleReviewAssistant.test.tsx`
asserts the approved sentences render (and not for the clothing store). **Blocked on deploy** (below).

### F2 — live wheel spins 7.0 s, task requires 5–6 s (2 failures × 3 stores)
Deployed spinner: `{fullSpins: 8, durationMs: 7000}`. Working tree: `{fullSpins: 8, durationMs: 6000}`
(reduced-motion: 3000 ms) — within the 5–6 s window; measured ≈ animation + ~0.3–0.6 s overhead.
`SpinWinScreen.test.tsx` asserts the landed slice is the engine-assigned one. **Blocked on deploy** (below).

### B1 — BLOCKED (external, never a fake pass): Google anti-automation interstitial
Headless Chrome opens each store's own review URL but Google redirects to `/sorry/…`. The destination
is proven correct from the interstitial's `continue=` target (same query, same per-location `#lrd` CID).
Labeled `BLOCKED(external)` per project precedent (`393c2fc`).

### By design (verified, not defects)
- `pashupati` has no saved review link → CTA disabled, skip available, never another branch's link.
- Wheel column labels use the established `displayLabel` truncation (`MAKING-CH…`); the **full**
  saved gift name is what the reveal shows. Order and content verified per column.
- Returning-visitor state ("WELCOME BACK!") is the deliberate sessionStorage flow state.

## Harness fixes applied during this session (`scripts/pashupati-e2e.mjs`)
1. backend cross-check queried `phone` → column is `customer_phone` (false-fails).
2. spin locator matched two buttons (strict mode) → explicit 'Spin Now' / 'Spin the wheel'.
3. Google interstitials counted as failures → `BLOCKED(external)` + destination verified via `continue=`.
4. run 2 restored run 1's sessionStorage journey → fresh-device reset per run.
5. landing label read after the reveal unmounted the wheel → read at land time; mid-word truncation
   tolerance for column labels; rAF-stall recovery (reload restores the assigned reward, never re-rolls).

## Deploy gate — why F1/F2 are not yet fixed live

The working tree contains both fixes **plus the (unshipped) invoice feature**, whose client call
(`submit_customer_entry` with `p_invoice_details`) is incompatible with production's current 7-arg
function — deploying the tree as-is would break **every customer submission on every store**.
Shipping F1/F2 therefore requires the still-pending gate-1 decision:

- **Option B (recommended):** additive compat migration — production's current function body
  unchanged + `p_invoice_details text default null` (NULL-stored). Zero reward-engine semantics
  change (task's "do not change existing business rules"), then deploy the tree and re-run this matrix.
- **Option A:** full chain `20261017150000` → `20261017150100` → `20261018120000` (+ history backfill).
  Imports gift price-policy/stock semantics into the live reward engine (explicit sign-off required).
- **Option C:** deploy a task-scoped build without the invoice field (no migration; invoice ships later).
- **Defer:** leave live as-is; F1/F2 remain visible to customers at the three URLs.

## Evidence
- runs: `artifacts/pashupati-e2e/{pashupati1,pashupati2,pashupati}/*.png` + `summary.json`
  (prior add-path runs preserved at `artifacts/pashupati-e2e-prior-runs/`)
- live bundle probes: deployed `CustomerFlow-D4Wb6lML.js` (clothing set, `durationMs:7e3`), run logs in
  `%TEMP%\opencode\jriq-deploy\logs\v1.3.1\`
- unit suite: `vitest` 372/372 (29 files)

## Closure - post v1.3.1 deploy (2026-10-19)

The owner approved **Option B** (additive compat migration, zero reward-engine semantics
change); the tree shipped to production as release `v1.3.1` (bundle `index-BmAPB-ZG.js`,
byte-verify 52/52, deploy-verify 11/11, prod-smoke 35/35 - `docs/V1.3.1_RELEASE_REPORT.md`).
F1 and F2 are now **fixed live**; the closure matrix on the live bundle:

| Store | Journey result | Wheel duration measured |
|---|---|---|
| pashupati1 | **30 passed / 0 failed / 2 blocked(external)** | 6217 ms, 6346 ms |
| pashupati2 | **30 passed / 0 failed / 2 blocked(external)** | 6357 ms, 6556 ms |
| pashupati | **26 passed / 0 failed / 0 blocked** | 6515 ms, 6492 ms |

- **F1 closed**: all 10 approved jewellery sentences render verbatim on both linked
  stores (topic chips in approved order), tap-to-copy carries exactly the sentence.
- **F2 closed**: every spin measured inside the 5-6 s window (6000 ms animation + ~300-700
  ms render overhead).
- **B1 unchanged** (external): Google's headless interstitial, destination proven = each
  store's own link.
- **B2 (new, honest label)**: the transient "Copied" status line could not be observed
  headless (clipboard-promise settlement under `window.open`); the copy behaviour itself
  is proven exact and the confirmation render is pinned by
  `GoogleReviewAssistant.test.tsx`. Labelled BLOCKED, never a pass.
- Harness hardening added for the closure runs: headless anti-throttling flags (rAF stalls
  were starving the spin), atomic landing-label read (a 400 ms reveal-unmount race lost
  one read), multi-sample copy-status window.

## Release 2026-10-19 (5-second wheel, verified review links, invoice prompt)

Scope of this release per the deployment brief: five-second wheel animation (supersedes the
earlier 5–6 s spec), independent verification and per-store saving of the Google review links
from the supplied URLs, vendor-editable gift fields verified per wheel segment (temporary test
names, change-one, restore), the customer form's invoice prompt, per-store E2E and this report.

### Google review links — verified per branch in a real browser (§2)

Each supplied URL was opened and the native Google review interface verified (the `#lrd=<cid>`
fragment opens Google's own **"Write a review dialogue"** modal — confirmed in the browser
accessibility tree, page title carrying the exact business name). The **exact saved URL** of each
store was then opened and re-verified (the saved `#lrd=<cid>,3` form opens the same modal as the
supplied `#lrd=<cid>,3,,,,` form):

| store | business name verified on the opened page | listing CID | URL of record (saved per store) | verdict |
|---|---|---|---|---|
| pashupati1 | "Pashupati a unit of BSKK LLP" (Bhelupur / Vijaya Road, Opp. Hotel Diamond) | `0x398e3128434bb691:0x96988d31a11155ac` | `https://www.google.com/search?hl=en-in&gl=in&q=Pashupati+a+unit+of+BSKK+LLP#lrd=0x398e3128434bb691:0x96988d31a11155ac,3` | **VERIFIED** — write-review modal opens for this branch |
| pashupati2 | "Pashupati a unit of benaras Swarn Kala Kendra llp Lohta" (Lohta, Opp. Lohta Thana) | `0x398e2de6beabada3:0x5e7aa4810675d71f` | `https://www.google.com/search?hl=en-in&gl=in&q=Pashupati+a+unit+of+benaras+Swarn+Kala+Kendra+llp+Lohta#lrd=0x398e2de6beabada3:0x5e7aa4810675d71f,3` | **VERIFIED** — write-review modal opens for this branch |
| pashupati | (no distinct listing found) | — | **NULL — intentionally unset** | **OPEN ITEM** (below) |

Corrections resolved during verification:

- The brief's inline "candidate 2" URL carries **BSKK's CID** (`0x…:0x96988d31a11155ac`) and the
  third pasted URL is the **same BSKK listing** again. Per the brief ("never invent a link or
  reuse another branch's link") neither may be used for Lohta or the third location. The raw
  pasted kgmid URL (Lohta, CID `0x5e7aa4810675d71f`) is the correct second link and matches what
  is saved for `pashupati2`.
- The saved `#lrd=<cid>,3` URL form was confirmed to open the same native write-review modal as
  the screenshots' `#lrd=<cid>,3,,,,` form — **no URL change was required**; the two configured
  stores already held their own verified destinations (distinct CIDs, saved separately per store).

**OPEN ITEM — third location (Pashupati, Godowlia).** The brand's own listings and posts show
three branches: *Opp. Hotel Diamond, IP Vijaya Road, Bhelupur* (= pashupati1), *Lohta, Opp. Lohta
Thana* (= pashupati2), and *State Bank Building, Opposite Hotel Augusto, Godowlia* (= the third
location). Google search, Google Maps search and web search surface **no distinct Google Business
Profile for the Godowlia branch**; the third supplied URL duplicates the BSKK listing. Per the
brief this is reported rather than invented: `google_review_url` stays `NULL`, the review CTA
stays disabled on that store's page, the skip path works, and no branch's link is reused. The
owner should claim/create the Godowlia listing and supply its URL to enable the CTA.

### Deployment (§7–§8)

Build produced from a clean worktree at the v1.3.1 commit **plus the five-second wheel change
only** (`SPIN_DURATION_MS = 5000`), with the unrelated in-tree workstream changes excluded from
the build. Configuration verified in the shipped bytes: production Supabase project
(`awshkiwqkuubkhecszzk`), `VITE_PUBLIC_APP_URL=https://jriq.in` baked into `lib-*.js`, anon key
only (preflight role classification `anon:1`), no demo-mode fallback.

| gate | result |
|---|---|
| preflight (`npm run preflight:root`) | **11/11** (deps, env selection, anon role, lint, unit tests, tsc+build, secret scan, key classification, dist output, base path, SPA fallback) |
| upload order | assets (46, 6 chunks, all 201) → root static (5, 201) → `index.html` + `.htaccess` last (201) |
| byte-verify (`node scripts/byte-verify.mjs dist https://jriq.in`) | **52/52 byte-identical**, exit 0 |
| deploy-verify (bundle ref, app shell, assets, legacy 301 `/store/:slug`→`/:slug`, SPA fallback, TLS chain) | **11/11** |

**Second deploy of the same day (not ours).** After the verification above, the live origin began
serving bundle `index-Dh4HqAXG.js` — a build produced by the **parallel in-repo workstream**
(the one editing the shared working tree throughout this session). Classification of the served
bytes: production Supabase project ✅, `p_invoice_details` ✅, approved jewellery review set ✅,
wheel constant `{fullSpins:8, durationMs:5e3}` ✅ (byte-identical spin code to the release build;
re-measured live at 5085–5096 ms), `https://jriq.in` baked ✅ — plus that workstream's
gift-columns/BCY frontend (`save_store_gift_columns`, `get_store_gift_pool`).

Backend consistency of that state was probed **read-only**: `stores.gift_columns` exists on
production and `get_store_gift_pool(text)` executes (returns `[]` for an unknown slug), while a
calibration call to `submit_customer_entry({})` reproduces the same PGRST202 "call shape not
matched" error that an empty-body probe of `save_store_gift_columns` returns — i.e. the
gift-columns migration **is applied on production** and the deployed frontend does **not** call a
missing database function. All three Pashupati stores remain in their verified reward
configuration (8 approved gifts + 8 purchase brackets, `gift_columns` NULL).

Every result in this report was re-run against the bundle production actually serves (see
per-store tables above/below). The release brief's "no unrelated changes in the deployed build"
constraint was satisfied by *our* deploy; the later swap is documented here as observed fact, not
authored by this workstream.

### Per-store E2E against the live build (§6) — gift fields, five-second wheel, invoice

Method per store (`scripts/pashupati-e2e.mjs`, phases `admin` + `journey --headed`): open the
owner's gift configuration; add a unique set of temporary test gift names in the configured
fields; save with no API/database errors; refresh and confirm every gift persists; open the
customer page and confirm **every wheel segment shows its saved gift name in vendor order**;
change **one** gift and confirm **only** that segment moves; then restore the exact pre-test
configuration and verify it byte-identically (including cross-store isolation snapshots). The
customer journey then runs on the restored (actual) configuration: welcome → details form
**including the invoice prompt (the form's last prompt)** → review invitation (approved topic
chips in order, all 10 approved sentences verbatim, tap-to-copy, one-click / Open Google → the
store's own destination, skip path) → spin → reveal → thank-you, with the wheel measured in a
**visible (headed) browser** and the persisted submission cross-checked in the database.

| check (§6) | pashupati1 | pashupati2 — Lohta | pashupati — Godowlia |
|---|---|---|---|
| one editable gift-name field per configured wheel segment; save; no errors | PASS | PASS | PASS |
| temporary test gift names persist after admin refresh (and in DB) | PASS | PASS | PASS |
| wheel segments = saved gift names, in vendor order | PASS | PASS | PASS |
| change one gift → only that segment changes (DB + wheel) | PASS | PASS | PASS |
| exact pre-test configuration restored (byte-identical) | PASS | PASS | PASS |
| wheel animation ≈ **5 s** (visible browser) | **5075 / 5077 ms** | **5096 / 5085 ms** | **5061 / 5160 ms** |
| customer form incl. invoice prompt → invoice persisted in `submissions.invoice_details` | PASS (filled run 1, blank run 2 stores NULL) | PASS (same) | PASS (same) |
| review invitation: approved chips + 10 sentences verbatim | PASS | PASS | n/a (CTA disabled by design) |
| copy a review recommendation = only the review text + UI confirmation | CONFIRMED (see note) | CONFIRMED (see note) | n/a |
| one-click / Open Google → **this store's** link | PASS (+ interstitial BLOCKED-external) | PASS (+ interstitial BLOCKED-external) | n/a — never another branch's link |
| skip the review → journey continues | PASS | PASS | PASS |
| spin stops on engine-assigned reward; reveal name + claim code = backend | PASS (both runs) | PASS (both runs) | PASS (both runs) |
| submission persisted (amount, reward_label, coupon_code) | PASS | PASS | PASS |
| cross-store isolation during gift testing | PASS (other two stores byte-unchanged) | PASS | PASS |
| **totals (admin 13 checks + journey)** | **13/13 + 32 passed / 0 failed / 2 blocked** | **13/13 + 32 / 0 / 2** | **13/13 + 28 / 0 / 0** |

Note on copy: the tap-to-copy behaviour is verified by the app's own "✓ Copied" confirmation
(`confirmed=true` in every linked-store run) and by `GoogleReviewAssistant.test.tsx` (unit-pinned
exact text). The harness's OS-clipboard readback is **unreliable in this environment** — the read
is restricted in the headed window, and one desktop actor persistently writes `https://www.jriq.in/`
to the shared clipboard (observed even after the harness invalidated the clipboard before the tap).
These cases are labelled `BLOCKED(external)` — never a fake pass and never a product failure.
Google's anti-automation interstitial on tab-open is likewise labelled BLOCKED-external with the
destination proven equal to the store's own URL (from the interstitial `continue=` target).

**Test-data hygiene:** every mutation cycle restored the exact approved configuration (final
state re-verified against the database: 8 approved names in order on all three stores, zero
stray test names). QA submissions use synthetic names/phones unique to each run and are kept as
evidence following the established QA-row pattern; they can be deleted on request.

## Independent verification pass (second workstream, same day)

A second verification pass ran the same harness against the same live bundle
(`index-Dh4HqAXG.js`), after re-applying the brief's 5-second constant (a concurrent
`git checkout` had reverted `SPIN_DURATION_MS` to 6000 in the shared tree; the untracked
timing pin was realigned to the brief's 5 s) and after fixing the owner-panel rename path
so the wheel label follows the saved gift name.

Totals from this pass (`--phase admin` + `--phase journey --headed`, per store):

| store | admin round trip | journey | wheel measured (visible browser) |
|---|---|---|---|
| pashupati1 | 13/13 | 32 passed / 0 failed / 2 blocked(external) | 5079 ms, 5071 ms |
| pashupati2 | 13/13 | 32 passed / 0 failed / 2 blocked(external) | 5097 ms, 5089 ms |
| pashupati | 13/13 | 28 passed / 0 failed / 0 blocked | 5063 ms, 5162 ms |

Two concurrent-run incidents were detected and handled honestly (both are test-harness
coordination facts, not product defects):

1. **Healed leftovers**: `pashupati1` opened with eight leftover `TMP A088 G1..G8` gift
   names from an interrupted earlier run. The harness's self-heal restored the approved
   ladder names before any testing, and the final state was verified byte-identical to
   the pre-test snapshot.
2. **Live-edit collision**: the first `pashupati` journey run raced another session's
   gift renames (`TMP 5179 ...`) mid-flight - its wheel/reveal mismatches were caused by
   that live edit (reward labels captured the temporary names at submit time). The run
   was discarded and re-executed after the store was restored; the re-run is clean
   (28/0/0 above).

Cross-store isolation held throughout: every admin round trip proved the other two
stores' rows byte-unchanged, and the final database read shows all three stores on the
approved 8 gifts + 8 brackets with `gift_columns` NULL.
