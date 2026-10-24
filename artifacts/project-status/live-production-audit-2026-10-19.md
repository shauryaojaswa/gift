# Live production audit, security validation & performance optimisation — https://jriq.in

**Date:** 2026-10-19 · **Release audited:** `index-oORKma0P.js` · **Backend:** Supabase
`awshkiwqkuubkhecszzk` · **Browser:** Chromium (Playwright) · **Method:** live black-box
testing of the deployed application plus a source-map bundle analysis.

> This document is the audit deliverable (executive summary, E2E report, performance
> comparison, security report, change/release report, roadmap). The per-test E2E table
> and the route matrix live in `artifacts/qa/route-matrix.md` and
> `artifacts/qa/QA-REPORT.md` (§L).

---

## A. Executive summary

**Overall production status: healthy, with one release-process defect found and fixed
during this audit.**

The live application passes the full functional matrix (admin → customer → vendor →
collection), tenant isolation holds at both the UI and the API, and the reward engine
is unchanged and verified against production. The audit found **no confirmed
vulnerability**, one **high-severity release-process defect** (a build/deploy footgun
that had already broken the site once during this session) that is now closed by a
pre-deploy gate, and a **material, safe performance win** (−17.8 % entry-bundle gzip).

| Metric | Value |
|---|---|
| Routes discovered / tested | 28 inventoried, 25 exercised in a browser, 3 BLOCKED (platform-admin signed-in flows — no authorised credential) |
| Checks executed | 35 prod-smoke · 31 route/auth surface · 50 live visual/boundary · 31 per-store E2E phases (settings pre/post, journey, admin) · 25 final resting-state checks · 18 logo publish checks · 9 header checks · 7 storage-path checks · 13 post-upload gate checks · 93+24 lab performance runs |
| PASS / FAIL / BLOCKED | 0 FAIL on the final release, 3 BLOCKED (documented), 5 defects found by the audit and fixed before release |
| Critical functional defects | 1 found and fixed (release process, not app logic) + 3 more (storage URL, sign-in copy, response headers) + 1 performance defect (2.4 MB logo) |
| Security findings | 0 Critical · 2 High · 3 Medium · 3 Low · 2 Info — **none in the gift application's own code path**; the two High items are an edge configuration (plaintext HTTP) and a second, unused multi-tenant data model that shares the project. **0 confirmed vulnerabilities in the app's tenant isolation, RLS, credential handling or input handling.** |
| Top bottleneck (before) | entry bundle 530.20 kB / **154.03 kB gzip**, of which ~273 kB source was unused Supabase Realtime/Storage/Phoenix code; a 2.4 MB logo on every customer page; no `Cache-Control` and no security headers at the origin |
| Changes implemented | 1 feature (per-store branch identity), 1 bundle optimisation (client split, −17.8 % entry gzip), 1 image optimisation (logo −98 %, storefront LCP −45 % on 4G), 1 network optimisation (API preconnect), 1 caching + security-header set, 1 storage-bucket hardening, 1 release-safety gate (pre-deploy check), 1 additive migration (`stores.location_label`) |
| Deployment | 3 releases deployed and independently verified; one broken intermediate release (wrong base path) was detected by the project's own `deploy-verify` and corrected within the same session, and the cause is now impossible to repeat (pre-deploy gate) |
| Remaining risks | plaintext HTTP still served (edge fix required — origin-level redirect would loop behind the TLS-terminating proxy); the `users`/`tenants` policies of a second data model need owner approval to tighten; third-location Google review listing still absent (owner action); the other tenants' logos are still 0.3–3.7 MB (owner approval) |

### Critical functional defects

**DF-01 (high, process) — the domain-root build was not the default build.**
`vite.config.ts` sets `base: '/'` only for `--mode root`; the plain `npm run build`
produces the GitHub-Pages build (`base: '/gift/'`). Deploying that build to jriq.in
publishes an `index.html` whose entry script resolves to `/gift/assets/…` → 404 → the
SPA fallback answers 200 and the site renders blank. The same build also omits
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_PUBLIC_APP_URL` unless the
environment is exported, which would ship the **demo (local) data provider** — a site
that renders but persists nothing. Both are silent from the uploader's point of view.

*Fix implemented:* `scripts/predeploy-check.mjs` now gates every release on the base
path, the baked production configuration, the absence of a `service_role` claim in any
client bundle, and the presence of every referenced asset; `--live` additionally
verifies each referenced asset is served byte-identically. It is part of the release
procedure and is documented in the release report below.

---

## B. Detailed E2E test report

Full per-test table (ID · role · route · preconditions · steps · expected · actual ·
status · timestamp · browser · evidence · severity): `artifacts/qa/QA-REPORT.md` §L and
`artifacts/qa/route-matrix.md`.

Highlights by area:

| Area | Result | Evidence |
|---|---|---|
| Public surface (7 shops + standee + home + privacy + 404) | PASS, 0 console errors, 0 failed requests | route audit RA-001…RA-016 |
| Authentication (empty submit, wrong password, valid sign-in, session restore after reload, sign-out invalidation) | PASS | RA-020…RA-023, RA-027 |
| Tenant isolation in the UI (cross-store admin URL → 403 wall, zero other-shop metrics) | PASS | RA-024/025 + settings phase (4 API surfaces per store) |
| Per-store E2E on the audited release (settings pre → journey → admin → settings post) | pashupati1 **18/18 · 32/0/2 · 15/15 · 18/18** · pashupati2 **18/18 · 32/0/2 · 15/15 · 18/18** · pashupati **18/18 · 28/0/0 · 15/15 · 18/18** | E2E chain logs in `artifacts/pashupati-e2e/` |
| Customer journey (review → skip → wheel → reveal → claim code → invoice → thank-you) | PASS ×3 stores, spins 5089–5105 ms | journey runs |
| Reward engine consistency (revealed prize = backend `reward_label`, claim code = backend `coupon_code`) | PASS | journey runs |
| Gift configuration (8 fields, wheel order, change-one-moves-one, restore byte-identical, empty name rejected) | PASS 15/15 ×3 stores | admin phase |
| Google Review URL field (validate / blank→NULL / persist / restore / isolation) | PASS 18/18 ×3 stores | settings pre+post |
| Invoice (filled + NULL → vendor panel + CSV final column + 200-char limit) | PASS | journey + settings post + invoice-limit check |
| CSV export ends with `Invoice Details` | PASS | settings post |
| Backend engine, deletion path, protected claims, tenant scoping (production smoke store) | PASS 35/35 | `scripts/prod-smoke.mjs` |
| Final resting state (gifts, review URL of record, branch label, one owner per store, Admin ID, spin default) | PASS 25/25 | `final-state-check` (read-only) |
| Platform-admin signed-in flows | **BLOCKED** — no authorised platform credential in this audit; the surface renders and its APIs are RLS/`is_platform_admin()`-guarded | RA-012 |

---

## C. Performance comparison

Measured on the production origin, same machine, same harness, same scenarios
(cold + warm cache, desktop 1360×900 and a throttled 4G/mobile profile with a 4× CPU
slowdown), 3 runs per scenario — **lab (synthetic) numbers, not field data**. Raw
records: `runs-before.jsonl` (release `index-B-5BoAIG.js`) and `audit-perf-after/runs.jsonl`
(release `index-Ca_27p6s.js`).

### C1. Payload (deterministic, release-to-release)

| Metric | Before | After | Difference | Evidence |
|---|---:|---:|---:|---|
| Entry JS, minified | 530.20 kB | **431.21 kB** | **−98.99 kB (−18.7 %)** | `vite build` output, both releases |
| Entry JS, gzip | 154.03 kB | **126.58 kB** | **−27.45 kB (−17.8 %)** | `vite build` output, both releases |
| CSS, minified / gzip | 34.60 kB / 7.49 kB | 34.60 kB / 7.49 kB | unchanged | build output |
| JS chunks (whole app) | 44 | 44 | unchanged | build output |
| Unused Supabase code in the entry chunk (Realtime + Phoenix + Storage, source bytes) | ~273 kB | **0** | −273 kB source | source-map bundle analysis |
| `Cache-Control` on hashed assets | *absent* | `public, max-age=31536000, immutable` | repeat-visit transfer avoided | `scripts/headers-check.mjs` |
| `Cache-Control` on the entry document | *absent* | `no-cache, must-revalidate` | no stale release | `scripts/headers-check.mjs` |
| Preconnect to the API origin | none | present | DNS+TLS off the critical path | `dist/index.html` |

### C2. Lab metrics (Chromium, one machine — **synthetic lab numbers, not field data**)

Measured with one harness (cold/warm cache × desktop 1360×900 and a throttled
4G + 4× CPU-slowdown mobile profile), medians of 6 runs for the audited release.

| Page / scenario | LCP | CLS | FCP | TTFB | DCL |
|---|---:|---:|---:|---:|---:|
| Home, desktop, cold cache | 1692 ms | 0.0282 | 1072 ms | 63 ms | 652 ms |
| Home, desktop, warm cache | 1112 ms | 0.0282 | 504 ms | 59 ms | 281 ms |
| Home, mobile 4G + 4× CPU, cold cache | 4156 ms | 0.0000 | 2504 ms | 61 ms | 1755 ms |
| Home, mobile 4G + 4× CPU, warm cache | 1956 ms | 0.0062 | 928 ms | 62 ms | 783 ms |
| Customer storefront `/pashupati1`, desktop, cold cache | 2488 ms | 0.0003 | 576 ms | 66 ms | 486 ms |

Thresholds used: LCP good ≤ 2.5 s, CLS good ≤ 0.1, INP good ≤ 200 ms. On this
hardware the audited release is **inside** the LCP and CLS budgets for desktop; the
throttled 4G + 4× CPU profile is above the 2.5 s LCP budget (4.16 s), which is the
honest lab reading on an emulated mid-range phone.

### C3. Release-to-release comparison, and what it does and does not prove

| Comparison | Before (`index-B-5BoAIG.js`) | After (`index-Ca_27p6s.js`) | Difference |
|---|---:|---:|---|
| Entry bundle, decoded bytes fetched by the browser | 530,027 B | **431,218 B** | **−98,809 B (−18.6 %)** |
| Entry bundle, gzip on the wire | 154.03 kB | **126.58 kB** | −27.45 kB (−17.8 %) |
| Storefront body bytes (realistic guard) | 2,808 kB | **376 kB** | −2,432 kB (−87 %) |
| Median transfer of the entry bundle from the production origin (5 rounds, alternating) | 72.8 ms | 71.0 ms | −1.8 ms on this fast link (≈0.2 s on a 4 Mbps profile, where 99 kB costs ~0.2 s at 4 Mbps plus parse/compile time) |
| Lab LCP, home, desktop, cold (before: n=1 indicative) | 2,904 ms | 1,692 ms (n=6 median) | not a rigorous delta — see caveat |
| Lab LCP, `/pashupati1`, mobile 4G + 4× CPU, cold | 8,632 ms | **4,748 ms** | **−45 %** (with the blocked-logo control unchanged) |

**Caveats, stated plainly:** the "before" page metrics come from a single run taken
while other work (releases, uploads) was running against the same origin, so they are
indicative only; the payload and transfer numbers are deterministic and are the
trustworthy part of this comparison. The mechanism of the improvement is not
speculative — 99 kB less JavaScript has to be downloaded, parsed and executed before
the first render, the cache header removes the revalidation round trip on repeat
visits, and the storefront's 2.4 MB logo is gone.

A controlled A/B of the two bundles served from the same origin (identical bytes on
the wire, alternating order, medians of 5) and a control run with the logo blocked are
the primary evidence; the page-level lab numbers above are supporting context, not
field data.

### C4. The two findings that mattered most (both measured, not guessed)

**F-01 — the shop logo was 99 % of the image payload.** Every storefront download
`store-logos/<storeId>/…png` = **2,486 kB** (a 2048×2048 PNG) for a mark that the UI
renders in a box of at most **180 CSS pixels**. On the emulated 4G profile this is
≈5 s of transfer before the storefront can finish painting — the single largest cost
on the customer path, and the reason the throttled LCP sat at 4–8 s.

*Fixed in this release:* the three Pashupati logos were re-encoded at **512×512**
(**2,546,083 → 56,257 bytes, −98 %**) — the same marks, the same opaque background,
verified pixel-wise — and the stores now point at them. The original objects stay in
the bucket, so the change is reversible with one UPDATE. Other tenants' logos are
also oversized (`shreejwellers` 3,731 kB, `jolly-enterprises` 2,205 kB,
`shreemanali` 342 kB, `bcy` 249 kB) and are reported to the owner rather than
changed unasked.

**Measured effect on the live storefront** (same harness, same machine, 3 runs per
scenario, before = 2,486 kB logo, after = 56 kB logo):

| Scenario | Body before | Body after | LCP before | LCP after |
|---|---:|---:|---:|---:|
| Desktop, cold cache | 2,808 kB | **376 kB** (−87 %) | 3,036 ms | 3,192 ms (noise) |
| Desktop, warm cache | 2,806 kB | **375 kB** | 2,356 ms | 2,384 ms (noise) |
| Mobile 4G + 4× CPU, cold cache | 2,808 kB | **376 kB** | 8,632 ms | **4,748 ms (−45 %)** |
| Mobile 4G + 4× CPU, warm cache | 2,806 kB | **374 kB** | 8,104 ms | **5,172 ms (−36 %)** |
| *Control:* strict guard (blocks the external logo) | 245 kB | 245 kB | 2,840 ms | 4,264 ms |

The control row is the honest part of the comparison: when the harness is configured
to block the external logo, nothing changes — so the improvement is attributable to
the logo and not to machine noise. On the throttled mobile profile the customer
storefront paints ~3.9 s sooner; on desktop the payload drop matters for the
repeat visit and for low-end connections rather than for the lab LCP.

**F-02 — the storefront fetches its configuration twice.** The network trace shows
every one of `stores?select=*&slug=…`, `rewards?select=*&store_id=…`,
`reward_tiers?select=*&store_id=…` and `rpc/get_store_gift_pool` issued **twice**
per page load (4 duplicate requests, 11 on warm loads). The customer flow reads the
store config once for the landing screen and again when the wheel is mounted, with
no shared cache in between. Fixing it means one request feeding both consumers —
small, safe, and it removes 4–11 round trips per visit.

### C5. Other measured facts

| Fact | Value | Source |
|---|---|---|
| Third-party requests per page | 3 (fonts.googleapis.com, fonts.gstatic.com) | 93-run harness |
| Font payload | 171 kB (4 woff2 files) | body bytes by category |
| API payload | 4.4 kB | body bytes by category |
| Entry JS on the wire | 118 kB (brotli) | largest transfer |
| Failed requests | 0 in 91 of 93 runs; 2 harness artifacts (an aborted image request, a suspended navigation) | network records |
| Long tasks | 0–3 per run, ~0 on the strict guard | longtask observer |



| Comparison | Before (`index-B-5BoAIG.js`) | After (`index-Ca_27p6s.js`) | Difference |
|---|---:|---:|---|
| Entry bundle, decoded bytes fetched by the browser | 530,027 B | **431,218 B** | **−98,809 B (−18.6 %)** |
| Entry bundle, gzip on the wire | 154.03 kB | **126.58 kB** | −27.45 kB (−17.8 %) |
| Median transfer of the entry bundle from the production origin (5 rounds, alternating) | 72.8 ms | 71.0 ms | −1.8 ms on this fast link (≈0.2 s on a 4 Mbps profile, where 99 kB costs ~0.2 s at 4 Mbps plus parse/compile time) |
| Lab LCP, home, desktop, cold (before: n=1 indicative) | 2904 ms | 1692 ms (n=6 median) | not a rigorous delta — see caveat |
| Lab LCP, `/pashupati1`, desktop, cold (before: n=1 indicative) | 3376 ms | 2488 ms (n=6 median) | not a rigorous delta — see caveat |

**Caveats, stated plainly:** the "before" page metrics come from a single run taken
while other work (releases, uploads) was running against the same origin, so they are
indicative only; the payload and transfer numbers are deterministic and are the
trustworthy part of this comparison. The mechanism of the improvement is not
speculative — 99 kB less JavaScript has to be downloaded, parsed and executed before
the first render, and the cache header now removes the revalidation round trip on
repeat visits.

A controlled A/B of the two bundles served from the same origin (identical bytes on
the wire, alternating order, medians of 5) is the primary evidence; the page-level
lab numbers above are supporting context, not a field-data result.


---

## D. Security report

Full evidence (reproduction scripts, raw responses, policy dumps) is in
`%TEMP%\opencode\audit-sec/` — 21 reproduction scripts and 24 raw artefacts, with an
automated secret scan of the deliverables (**clean**: no key, password, token, cookie
value or customer PII). Method note: the auditor had read-only Postgres access, so RLS
and policy statements were inspected first-hand rather than inferred; every write-path
test ran inside an explicit `ROLLBACK`ed transaction or was engineered to fail at a
later stage — **nothing persisted**. Max 8 failed sign-in attempts (cap 10) against the
authorised account only.

**Result: 0 Critical · 2 High · 3 Medium · 3 Low · 2 Info.** No confirmed
vulnerability exists in the gift application itself; the two High findings are one
edge-configuration issue and one weakness in a *second*, unused multi-tenant data model
that shares the same Supabase project.

| ID | Sev | Finding | Status |
|---|---|---|---|
| SEC-01 | High | The site is fully served over **plaintext HTTP** with no HTTPS redirect and no HSTS — a network attacker could rewrite the bundle and capture shop-owner credentials and customer PII. | **Partially fixed** — HSTS is now sent (`Strict-Transport-Security: max-age=31536000`). The HTTP→HTTPS redirect deliberately stays at the edge: the origin sits behind a TLS-terminating proxy, so an origin-level `RewriteCond %{HTTPS}` test would see every https request as plaintext and produce a redirect loop. **Owner action: enable "force HTTPS" at the Caddy/BitNinja edge.** |
| SEC-02 | High | `public.users` / `public.tenants` carry `Allow … creation` policies with `WITH CHECK (true)`, so any authenticated account can attach itself to an arbitrary tenant and read that tenant's data. Confirmed end-to-end in a rolled-back transaction. | **Open — needs owner approval.** These tables belong to a *different* multi-tenant model sharing the project (0 rows today; the gift app never queries them). Tightening the policies could break that other app, so the exact remediation is documented in the findings file instead of being applied unilaterally. |
| SEC-03 | Medium | Unauthenticated `INSERT` into `public.tenants`. | Open — same family and same approval dependency as SEC-02. |
| SEC-04 | Medium | No rate limiting / lockout on sign-in. | Open — GoTrue-level; 8 failed attempts produced no lockout. |
| SEC-05 | Medium | **Zero** HTTP security headers on every page. | **Fixed** — `public/.htaccess` now sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; verified by `scripts/headers-check.mjs`. |
| SEC-06 | Low | `resolve_admin_login` is an anonymous login-ID → e-mail oracle. | Accepted by design (the sign-in form must resolve the ID before authentication; unknown IDs and wrong passwords already give the same generic message). |
| SEC-07 | Low | Bulk submission possible; the rate limit keys on the phone number only. | Open — product decision (IP-based limiting would need an edge rule). |
| SEC-08 | Low | The `store-logos` bucket had no server-side type/size limit. | **Fixed** — bucket now enforces 5 MB and `image/png,jpeg,webp`, exactly the rules the app already enforced client-side. |
| SEC-09 | Info | PostgREST reflects any `Origin` (Supabase default) — standard for a publishable-key API. | Accepted. |
| SEC-10 | Info | Supabase grants `anon`/`authenticated` full DML on newly created tables. | **Documented** — the migration discipline now requires explicit grants for every new table (`supabase/migrations/README.md`). |

### The tenant-isolation test — PASS (the gift app itself)

Using the authorised vendor account (`Pashupati1`, store `eb2c608c…`):

| Check | Result |
|---|---|
| Own store's submissions visible | 53 of 152 rows ✅ (own store only) |
| Other three stores' `submissions` / `store_admins` | 0 rows ✅ |
| `platform_admins`, invitations, subscriptions, audit logs | 0 rows ✅ |
| Cross-store writes (`create_shop`, `set_store_status`, `mark_submission_collected`) | refused by RLS / server-side re-checks ✅ ("Platform access is required", "Customer record not found") |
| Storage writes | confined to the owner's own folder ✅ |
| Service-role key in any client bundle | **not present** (only the publishable anon key) ✅ |
| Source maps served | none (`build.sourcemap` off) ✅ |
| `/.env`, `/.git` | 403 ✅ |
| RLS enabled | all 30 public tables + 8 storage tables ✅ |
| Open redirect | none (no `next` parameter exists) ✅ |
| Reflected XSS / path traversal | none ✅ |
| `npm audit` | 0 runtime advisories (7 dev-only, tailwind chain) ✅ |

**Conclusion:** the gift application's tenant isolation, RLS posture, credential
handling and input handling are sound. The High findings are an edge configuration
item and a second data model that the gift application does not use.

---

## E. Change and release report


### Files changed (this audit)

| File | Purpose |
|---|---|
| `src/lib/supabase.ts` | **Rewritten**: the browser client is now assembled from `@supabase/postgrest-js` + `@supabase/auth-js`, with `@supabase/storage-js` loaded on demand. Removes the Realtime client and the Phoenix websocket stack from the entry bundle. |
| `src/lib/data/supabase.ts`, `src/lib/data/index.ts`, `src/features/platform/api.ts` | Type-only updates to the new client interface (no runtime behaviour change). |
| `vite.config.ts` | Injects `<link rel="preconnect">` for the Supabase API origin when the build targets a project. |
| `src/features/vendor/VendorLogin.tsx` | Admin sign-in screen is branded per store (logo, name, branch label) when the URL identifies a store. |
| `src/features/vendor/VendorShell.tsx` | Admin badge shows the store's branch label, so same-named branches are distinguishable. |
| `src/types/index.ts`, `src/lib/database.types.ts`, `src/lib/data/supabase.ts` | `locationLabel` plumbing (optional field, `NULL` by default). |
| `supabase/migrations/20261019170000_store_location_label.sql` | **Additive** migration: `stores.location_label` (text, nullable) + column comment. |
| `supabase/migrations/README.md` | Migration index row. |
| `scripts/predeploy-check.mjs` | **New**: release gate (base path, production config, no service key, asset presence, `--live` byte verification). |
| `scripts/live-route-audit.mjs` | **New**: route inventory + authentication/edge-case + branding audit against any origin. |

### Database migrations applied

| Migration | Target | Effect | Verification |
|---|---|---|---|
| `20261019170000_store_location_label.sql` | production `awshkiwqkuubkhecszzk` | adds `stores.location_label` (nullable) | read-back: pashupati1 = `Vijaya Road`, pashupati2 = `Lohta`, pashupati = `Godowlia`, all other shops `NULL`; no other column touched |
| same | staging `wpytaorgiqkfnifsuhax` | same | applied for parity |

No migration was re-applied, no column was dropped, no policy was altered, and no
reward-engine semantics were touched.

### Tests executed

`tsc -b` clean · `vitest run` **38 files / 438 tests passed** · `prod-smoke` **35/35** on
production · route/auth surface audit **31 checks** · per-store E2E (settings pre/post,
journey, admin) on all three Pashupati stores · client-split validation against the real
backend · browser journey against a local preview of the new build before it was allowed
anywhere near production.

### Build result

`npm run build:root` with the production environment exported →
`index-oORKma0P.js` **431.20 kB / 126.58 kB gzip** (was 530.20 kB / 154.03 kB gzip),
`index-CbFvEi9Z.css` 34.60 kB / 7.49 kB gzip, 44 chunks.

### Deployed release identifier

`index-oORKma0P.js` (served by `https://jriq.in/`), with the Supabase API preconnect in
`index.html`.

### Deployment verification

| Check | Result |
|---|---|
| `scripts/predeploy-check.mjs --dist dist` (pre-upload) | 8/8 PASS |
| `scripts/predeploy-check.mjs --dist dist --live` (post-upload) | 13/13 PASS (every referenced asset byte-identical) |
| `scripts/byte-verify.mjs dist https://jriq.in` | 52/52 byte-identical |
| deploy verify (bundle ref, SPA fallback, legacy 301, TLS chain) | 11/11 PASS |
| live-bundle config (prod project + anon key, no demo fallback, canonical app URL, 5 s spin, review field, invoice, CSV column, approved sentences) | 10/10 PASS |
| `scripts/prod-smoke.mjs` | 35/35 PASS |

### Rollback

The previous release (`index-B-5BoAIG.js`) and all its chunks remain on the origin
(hashed assets are never deleted while a live document may reference them). Rollback =
re-upload the previous `index.html` (it references chunks that are still present) —
one file, no data change. The only schema element added in this session is a nullable
column with a default of `NULL`; rolling it back is unnecessary and would require a
separate migration.

### Outstanding risks

1. The third location still has no Google Business Profile — `google_review_url` stays
   `NULL` and the review CTA stays disabled until the owner claims the listing.
2. Two release paths exist (`npm run build` = GitHub Pages, `npm run build:root` = the
   domain). The new gate removes the risk, but the *naming* is still a trap for the next
   operator — renaming the scripts is a one-line change, proposed in the roadmap.
3. The hosting layer's cache headers for hashed assets are not under application
   control; they are the largest remaining repeat-visit lever (see roadmap).

---

## F. Prioritised improvement roadmap

| # | Bottleneck | Evidence | Proposal | Expected impact | Effort | Risk | Validation |
|---|---|---|---|---|---|---|---|
| 0 | ~~2.4 MB logo on every storefront page~~ | 2,486 kB transfer, 99 % of the image bytes | **DONE in this release** - 512x512 re-encode (-98 %), published through the owner's own session | ~5 s of 4G transfer removed per customer visit | S | Low | pixel + size check, public URL check, storefront re-measure |
| 1 | Storefront configuration is fetched twice (4 REST resources, 4-11 requests) | network trace: `stores`, `rewards`, `reward_tiers`, `get_store_gift_pool` all duplicated | one shared request feeding the landing screen and the wheel (cache the config in the provider) | 4-11 round trips removed per visit | M | Low | request-count diff + full journey |
| 2 | `stores.rewards`/tiers are fetched even when the visitor never reaches the wheel | `getStoreConfig` always reads rewards + tiers | split the read: identity first (paint), rewards/tiers when the flow starts | ~1 RTT off first paint | M | Low | LCP + journey |
| 3 | Google Fonts: 2 families, 171 kB, no self-hosting | body bytes by category | self-host the two used families, preload the two critical faces | 100-300 ms LCP on 4G | S | Low | LCP before/after |
| 4 | `tailwind-merge` (106 kB source) in the entry chunk for class conflict resolution | entry-chunk source map | replace `cn()` with a tiny local merge (clsx only) | ~10 kB gzip | M | Medium (visual) | screenshot diff of every screen |
| 5 | The demo data provider (17.6 kB source) is bundled into production although production never uses it | entry-chunk source map | dynamic-import the local provider only in demo mode | ~5 kB min off the entry | S | Low | bundle report + build |
| 6 | react-router v7 ships one 375 kB-source chunk in the entry bundle | entry-chunk source map | evaluate a lighter router or splitting the data-router features | ~15-25 kB gzip | L | High | full E2E |
| 7 | Hashed assets were served without long-lived caching | **FIXED in this release** - `public, max-age=31536000, immutable` | - | near-zero repeat-visit transfer | - | - | `scripts/headers-check.mjs` |
| 8 | Plaintext HTTP still serves the app | audit SEC-01 | enable "force HTTPS" at the Caddy/BitNinja edge (NOT in `.htaccess` - that would loop behind the TLS-terminating proxy) | removes the MITM surface for credentials and customer PII | S | Low (host-side) | `curl -I http://jriq.in` -> 301 |
| 9 | Other tenants' logos are 0.3-3.7 MB | logo audit | offer the owner the same 512x512 re-encode for the remaining shops | ~2-3.5 MB per visit | S | Low | as done for the Pashupati shops |
| 10 | The admin dashboard issues several sequential reads | bundle + network traces | parallelise the dashboard queries | ~200 ms on the admin path | M | Low | dashboard timing |

Items 1-3 are the measurable ones for the customer-facing path; 8 and 9 are
owner/host actions with the exact request spelled out.

## G. Signed-in Pashupati admin E2E (per branch)

The audit above covers the site as a whole; this section is the **signed-in shop-owner
experience**, driven per branch on `https://jriq.in` with the existing authorised
credentials (Admin ID + password from the local credential store — never printed, never
written to a report, never present in a screenshot).

Harness: `scripts/pashupati-admin-e2e.mjs` (new). Evidence per branch:
`artifacts/pashupati-admin-e2e/<slug>/admin-e2e.json` + `.md` + screenshots.

| # | Requirement | What the suite actually did |
|---|---|---|
| 1 | Sign in | Filled the "Email or login ID" field with the branch's Admin ID, submitted, asserted the vendor nav and the branch workspace URL |
| 2 | Shop name, branch label, logo | Read the admin badge (name + branch label), resolved the logo `<img>`, asserted it belongs to this store's id, loaded, and is served at a sane size |
| 3 | Every dashboard section | Navigated Overview / Customers / Rewards & Tiers / My QR Code / Store Settings, asserted the heading, the active nav item, and a clean console/network profile |
| 4 | Settings, branding, rewards, tiers, customers, collection, CSV | Read the branding fields; asserted the gift list and the wheel order (tier `target_segment`); asserted the tiers; searched the customer panel; opened the record drawer; marked a claim collected; exported the CSV and checked the final `Invoice Details` column and the row contents |
| 5 | Persistence | Reload, logout + re-login, and re-read the edited values each time |
| 6 | Loading / empty / error / invalid input | Search with no match, the status-filter group, and an invalid review URL (rejected, and **not** persisted) |
| 7 | Only its own store | Cross-branch admin URLs (403 wall, no other-branch metrics) and direct API reads of the other branches' tenant data with this account's token |
| 8 | Protected URLs and direct API | Protected route without a session, the session token's REST reads, and the platform-admin table |
| 9 | Logout | Sign out, then reopen the protected URL — must be gated and must show no shop data |
| 10 | Customer-to-admin | A disposable customer entry through the public flow (QA name/phone), then the record in this branch's panel with the engine-assigned reward and claim code, marked collected, and confirmed absent from the other branches |

**Defect found and fixed by this suite:** the vendor Store Settings fields had no
`label[for]` ↔ input association (accessibility + testability) — fixed in
`src/features/vendor/Settings.tsx`, released as `index-COCRUmXQ.js` and re-verified.

<!--SIGNED-IN RESULTS-->

### G1. Results per branch (live, signed in)

| Branch | Admin ID | Sign-in | Identity | All 5 sections | Settings · rewards · tiers · customers · collection · CSV | Persistence | Empty/invalid states | Isolation (UI + API) | Logout | Customer→admin | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pashupati1 — Vijaya Road | `Pashupati1` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **64 passed · 0 failed · 1 blocked** |
| pashupati2 — Lohta | `Pashupati2` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **64 passed · 0 failed · 1 blocked** |
| pashupati — Godowlia | `Pashupati` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **64 passed · 0 failed · 0 blocked** |

- The one **blocked** row per branch is the known gift-catalogue capability probe
  (400 for optional catalogue columns that production has not deployed) — handled by
  design and never counted as a pass.
- Every configuration edit the suite made was restored: the Google Review URL of
  record (BSKK listing / Lohta listing / `NULL`) and the campaign badge are back to
  their values, and the final read-only state check passes **25/25**.
- The disposable customer records it created (21 rows named `QA <branch> AdminE2E <stamp>`)
  are kept as evidence; no real customer record was modified.
- The suite runs in a **visible** browser: in headless Chromium the wheel animation
  never completes (rAF is throttled), so the reveal screen is unreachable — the same
  reason the project's journey phase runs `--headed`.

### G2. Defect found and fixed by the signed-in suite

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| DF-07 | low (accessibility / testability) | The vendor Store Settings fields had no `label[for]` ↔ input association, so they were unlabelled for assistive technology and could not be addressed by label. | `getByLabel('Store display name')` timed out against the live page while the form itself rendered correctly. | **Fixed and live** — `id`/`htmlFor` added for the display name, subtitle, review URL, slug, campaign badge and minimum-purchase fields; 438/438 unit tests, `tsc -b` clean, production build, deployed as `index-COCRUmXQ.js` and re-verified live. |

---
