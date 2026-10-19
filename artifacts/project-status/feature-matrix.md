# Feature matrix — implemented vs deployed vs verified

Audit date: 2026-10-18. Columns:
**Source** = code/migration exists in the working tree · **Deployed** = which live origins serve it
(J = jriq.in, P = GitHub Pages, V = gift-alpha-pearl preview) · **Verification** = the strongest
proof class achieved: `Functional (live)` behavioural proof in a browser · `Functional (tests)`
executed automated proof · `Rendered (live)` UI visible but behaviour not exercised ·
`Unverified` exists but not proven · `Not implemented`.

Legend for Source column: ✅ committed · 🟡 in working tree but **uncommitted** · ❌ absent.

## A. Customer experience

| Feature | Source | Deployed | Verification | Notes / evidence |
|---|---|---|---|---|
| QR entry `/{slug}` customer flow | ✅ | J, P | Functional (live) | full journey walked in demo mode; live welcome verified on both origins |
| Legacy QR path `/store/:slug` → `/{slug}` | ✅ | J, P | Functional (live) | J: real HTTP 301 (.htaccess); P: SPA redirect via `?p=` fallback |
| Alias `/{slug}/customer` + `/{slug}/costumer` | ✅ | J, P | Functional (live) | both render same flow, URL preserved (no redirect) |
| Details form + client validation | ✅ | J, P | Functional (live) | inline `[alert]` errors on empty submit, no network write |
| Purchase-amount quick chips | ✅ | J, P | Rendered (live) | ₹10K/₹40K/₹1L/₹2.5L buttons observed |
| Review invitation step (optional, skip) | ✅ | J, P | Functional (live) | copy verified; reward explicitly unaffected |
| Google review CTA (one-click, disabled w/o link) | ✅ | J, P | Functional (live) | correctly **disabled** in demo store without review link |
| Spin wheel + landing animation | ✅ | J, P | Functional (tests + live render) | `wheel-math.ts`, `SpinWinScreen.test.tsx`; wheel rendered live; animation observed in demo journey |
| **Server-side reward assignment** | ✅ | J, P | Functional (tests) | RPC `submit_customer_entry` draws `order by random()`; client cannot influence. Live proof of the RPC itself not taken (write) |
| Claim code + validity display | ✅ | J, P | Functional (live, demo) | `CLEAN-6CF36F` generated in demo journey; server format `prefix-8hex` per migration |
| Thank-you summary + masked phone | ✅ | J, P | Functional (live, demo) | `******3210` masking observed (presentation-level) |
| Idempotent submission (request_id replay) | ✅ | J, P | Functional (tests) | `unique(store_id,request_id)` + replay logic in RPC |
| Rate limit 5/hour per phone digest | ✅ | J, P | Functional (tests) | enforced in RPC; `public_submission_rate_limits` |
| Flow session resume (sessionStorage per slug) | ✅ | J, P | Functional (tests) | `gift:flow:{slug}` store persistence |
| Wheel segment labels + house palette | ✅ | J, P | Functional (tests) | `displayLabel` spec map, `HOUSE_WHEEL_PALETTE` |
| Standee page `/standee/:slug` (print + QR) | ✅ | J, P | Functional (live) | renders QR + review QR + campaign URL; "Print Standee" |
| QR canonical pin to `https://jriq.in/{slug}` | ✅ | J, P | Functional (live) | standee displays jriq.in URL even on Pages host (`VITE_PUBLIC_APP_URL`) |
| Privacy page `/privacy` | ✅ | J, P | Functional (live) | full sections rendered on both origins |
| Designed 404 (`*`) with slug-specific message | ✅ | J, P | Functional (live) | verified for unknown slug on both origins |
| Root home `/` (marketing) | ✅ | J, P | Functional (live) | server-assigned-rewards copy present on J |

## B. Shop-owner workspace (`/{slug}/admin/*`)

| Feature | Source | Deployed | Verification | Notes / evidence |
|---|---|---|---|---|
| Owner login (Supabase auth) | ✅ | J, P | Rendered (live) | form renders both origins; outcome not exercised (no credentials) |
| Tenant wall (Forbidden on wrong slug) | ✅ | J, P | Functional (tests) | `VendorShell.tsx:79-86`; redirect-to-login gate live-verified |
| Session gate → `/vendor/login` | ✅ | J, P | Functional (live) | `/{slug}/admin` signed-out lands on login |
| Overview + stats | ✅ | J, P | Unverified (live) | `getStats()` reads + client aggregation (source) |
| Customers list (search/filter/paginate) | ✅ | J, P | Unverified (live) | query building in `supabase.ts:266-329` |
| Mark collected (one-way) | ✅ | J, P | Functional (tests) | RPC `mark_submission_collected` |
| Rewards editor | ✅ | J, P | Unverified (live) | `upsertReward`/`deleteReward`; `wheel_label` fallback |
| Bracket (tier) editor with contiguity validation | ✅ | J, P | Functional (tests) | `save_store_tiers` server validation mirrors client `validateTierConfiguration` |
| Gift pool panel (multi-gift brackets) | ✅ | J, P | Functional (tests) | `GiftPoolPanel.test.tsx` (13) green |
| Settings: branding/logo upload | ✅ | J, P | Unverified (live) | storage bucket `store-logos`, decode check before upload |
| Settings: review link + platform-managed gating | 🟡 | — | Functional (tests) | uncommitted `Settings.tsx` change; https + omit-when-managed rules in migration |
| QR deliverable panel | 🟡 | — | Rendered (tests n/a) | uncommitted `QrDeliverable.tsx`; not deployed anywhere |

## C. Platform admin (`/platform/*`)

| Feature | Source | Deployed | Verification | Notes / evidence |
|---|---|---|---|---|
| Platform login + membership gate | ✅ | J, P | Rendered (live) | "Platform access required" wall (source-verified gate) |
| Shops list/provisioning (`create_shop`, trial, brackets) | ✅ | J, P | Unverified (live) | idempotent create; reserved-slug refusal |
| Shop status / owner link / rename slug | ✅ | J, P | Functional (tests) | `set_store_status`, `link_store_owner`, `rename_store_slug` |
| Review-link policy switch | 🟡 | — | Functional (tests) | `set_store_review_policy` in uncommitted migration |
| Catalogue CRUD (`gift_catalog`) | ✅ | J, P | Unverified (live) | price-policy CHECKs 🟡 (uncommitted migration) |
| Gift pool per shop (excluded stores, declared value, qty) | 🟡 | — | Functional (tests) | `GiftPoolPanel` rewrite + `save_store_gift_options(4-arg)`; uncommitted |
| Shop config panel | 🟡 | — | Functional (tests) | `ShopConfigPanel.test.tsx` (8) green; uncommitted |

## D. Legacy single-shop admin (`/admin/*`, `/dashboard/*`)

| Feature | Source | Deployed | Verification | Notes / evidence |
|---|---|---|---|---|
| `/dashboard/*` → `/admin` redirect | ✅ | J, P | Functional (live) | route-level `<Navigate>` |
| `/admin/login` | ✅ | J | **Broken on P** | J renders fine (fix `e025b5a`); P **crashes** (`useAdminAuth must be used within AdminAuthProvider`) |
| Admin shell/dashboard | ✅ | J, P (P broken entry) | Unverified (live) | requires legacy session |

## E. Backend / platform services (migrations)

| Feature | Source | Deployed | Verification | Notes / evidence |
|---|---|---|---|---|
| Core schema (stores/rewards/tiers/submissions/membership) | ✅ | J+P DB | Functional (live reads) | live reads 200 on customer flow |
| RLS on all 15 tables + storage policies | ✅ | J+P DB | Functional (tests) | not independently pen-tested `[Unknown]` |
| Submissions RPC-only writes (table INSERT revoked) | ✅ | J+P DB | Source-verified | `revoke insert, update, delete on submissions from anon, authenticated` |
| Stock tracking (`quantity`/`quantity_claimed`) | 🟡 | staging only (prior session) | Functional (tests) | uncommitted migration; not deployed to prod by this audit |
| Price policy (`value_min/value_max`, declared value) | 🟡 | staging only (prior session) | Functional (tests) | uncommitted migration |
| Per-shop gift exclusions (`excluded_store_ids`) | 🟡 | staging only (prior session) | Functional (tests) | uncommitted migration |
| Shop config management (slug rename, review policy) | 🟡 | staging only (prior session) | Functional (tests) | uncommitted migration `20261017150100` |
| Audit logging (`platform_audit_logs`, triggers) | ✅ | J+P DB | Source-verified | `audit_managed_change()` incl. delete-ref fix |
| Rate limiting table + logic | ✅ | J+P DB | Functional (tests) | digest-keyed per store |

## F. Build / ops / quality

| Feature | Source | Deployed | Verification | Notes / evidence |
|---|---|---|---|---|
| Dual build targets (Pages `/gift/`, root `/`) | ✅ | — | Functional (live) | both origins serve correct bases |
| GH Pages pipeline (workflow on `gh-pages`) | ✅ | P | Functional (live) | builds with `vars.VITE_SUPABASE_*`, pins `VITE_PUBLIC_APP_URL` |
| Vercel SPA rewrite | ✅ | J | Functional (live) | deep links work |
| `.htaccess` 301 for `/store/:slug` | ✅ | J | Functional (live) | server-level redirect observed |
| Pages SPA fallback `404.html` (`?p=` trick) | ✅ | P | Functional (live) | observed `?p=/store/...` document; stale `<title>` cosmetic issue |
| Unit/component tests (vitest, happy-dom) | ✅ | — | Functional (executed) | 359/359 green |
| QA harnesses (`qa-sweep`, `backend-e2e`, perf, recovery) | ✅ | — | Functional (prior run) | results in `artifacts/qa/` (some PENDING markers) |
| Client-acceptance matrix (`--base` live origin runs) | ✅ | — | Functional (prior run) | per commit `7d20873` message |
| CI on `main`/`staging` | ❌ | — | Not implemented | no workflows on those branches |
| Self-serve owner invite acceptance UI | ❌ | — | Not implemented (surface) | invitations table + `link_store_owner` exist; no client acceptance flow found |

## G. Explicitly disproven / negative checks

| Check | Result | Evidence |
|---|---|---|
| Staging-only shop `kohinoor` on production | Correctly 404s with designed message | Live-test |
| Unknown slug | Designed 404, never loads another shop | Live-test |
| Review CTA without configured link | Correctly disabled | Live-test (demo) |
| Empty details submit | Inline alerts; no request fired | Live-test (J + demo) |
| Cross-tenant slug access (UI layer) | Forbidden screen / redirect (UI), backed by `is_store_admin` + RLS | Source-code |
