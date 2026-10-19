# Live links — verified status of every known URL

Verification date: 2026-10-18 · Method: real browser (rendered a11y tree, console, network),
plus HTTP status/redirect observation. Detailed transcripts: `evidence/live-url-checks.md`.

**Labels:** `[Live-test]` observed live · `[Inference]` reasoned · `[Unknown]` not establishable.

| # | URL | HTTP | Renders | Redirects | Console errors | Backend calls | Version currency | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | `https://shauryaojaswa.github.io/gift/` | 200 | ✅ Home (JRIQ) | none | 0 | none on home | Pages build (`index-mdbBo4io.js`), base `/gift/` | **Live — functional** |
| 2 | `https://shauryaojaswa.github.io/gift/store/jolly-enterprises` | 200 (via `?p=` fallback) | ✅ Customer welcome | SPA → `/gift/jolly-enterprises` | 0 | production Supabase: stores/rewards/reward_tiers/**get_store_gift_pool** all 200 | ≥ v1.2.0 (pool RPC present) | **Live — functional (legacy path preserved)** |
| 3 | `https://shauryaojaswa.github.io/gift/vendor/login` | 200 | ✅ Login form | none | 0 | none at load | Pages build | **Live — functional** (auth itself not exercised) |
| 4 | `https://shauryaojaswa.github.io/gift/vendor/dashboard` | 200 | — | → `/gift/vendor/login` (session gate) | 0 | none | Pages build | **Live — gated, redirect working** |
| 5 | `https://shauryaojaswa.github.io/gift/admin/login` | 200 | ❌ **blank (crash)** | none | **`useAdminAuth must be used within AdminAuthProvider`** | chunks load 200 | **stale** — predates fix `e025b5a` | **Live but BROKEN** |
| 6 | `https://shauryaojaswa.github.io/gift/privacy` | 200 | ✅ Privacy policy | none | 0 | none | Pages build | **Live — functional** |
| 7 | `https://shauryaojaswa.github.io/gift/no-such-shop-xyz` | 200 | ✅ Designed 404 ("Store … not found") | none | 0 | store lookup 200/empty | Pages build | **Live — designed failure** |
| 8 | `https://jriq.in/` | 200 | ✅ Home (JRIQ) | none | 0 | none on home | root build (`index-DeRUSe92.js`), ≥ `e025b5a` `[Inference]` | **Live — functional** |
| 9 | `https://jriq.in/jolly-enterprises` | 200 | ✅ Customer welcome | none | 0 | production Supabase incl. **get_store_gift_pool**, all 200 | current | **Live — functional** |
| 10 | `https://jriq.in/store/jolly-enterprises` | 301→ | — | **server-level 301** → `/jolly-enterprises` | 0 | — | `.htaccess` behaviour matches `App.tsx:29-32` | **Live — redirect correct** |
| 11 | `https://jriq.in/jolly-enterprises/customer` | 200 | ✅ Customer welcome | none (URL preserved) | 0 | same as #9 | current | **Live — functional** |
| 12 | `https://jriq.in/jolly-enterprises/costumer` | 200 | ✅ Customer welcome | none (URL preserved) | 0 | same as #9 | current | **Live — functional** |
| 13 | `https://jriq.in/jolly-enterprises/admin` | 200 | — | → `/vendor/login` when signed out | 0 | auth session check | current | **Live — gate working** |
| 14 | `https://jriq.in/admin/login` | 200 | ✅ "Sign in to manage your store's campaign" | none | 0 | none at load | **includes `e025b5a` fix** | **Live — functional** |
| 15 | `https://jriq.in/platform/login` | 200 | ✅ Platform sign-in | none | 0 | none at load | current | **Live — functional** |
| 16 | `https://jriq.in/standee/jolly-enterprises` | 200 | ✅ "SCAN & SPIN" standee, QR + review QR + Print | none | 0 | store data 200 | current | **Live — functional** |
| 17 | `https://jriq.in/privacy` | 200 | ✅ Privacy policy | none | 0 | none | current | **Live — functional** |
| 18 | `https://jriq.in/kohinoor` | 200 | ✅ Designed not-found ("Store \"kohinoor\" not found") | none | 0 | store lookup empty | current | **Live — correct negative case** (shop exists only in staging data) |
| 19 | `https://jriq.in/no-such-shop-xyz` | 200 | ✅ Designed 404 | none | 0 | store lookup empty | current | **Live — designed failure** |
| 20 | `https://gift-alpha-pearl.vercel.app/store/jolly-enterprises` | 200 | ✅ old customer welcome | none (old route shape) | 0 | **zero Supabase calls** | **stale demo-era build** (old title/copy, `index-l1l-r0Gv.js`) | **Live but OBSOLETE** |

## Summary of problems found

1. **Broken:** #5 — Pages `/admin/login` crashes. Root cause pinned to deployment staleness
   (snapshot 22095f4 @ 08:35 vs fix `e025b5a` @ 20:33, same day). `[Live-test + Verified fact]`
2. **Obsolete:** #20 — pre-Backend build with localStorage persistence; reachable publicly. `[Live-test]`
3. **Everything else verified live behaves as designed**, including negative cases (unknown slug,
   staging-only slug) and legacy redirects/aliases. `[Live-test]`

## What was not verified about these links

- Login **outcomes** (real credentials) — not attempted; pages render and call the expected auth
  surfaces at submit time per source. `[Unknown]`
- Authenticated dashboards (owner/platform) — no sessions were created. `[Unknown]`
- A production submission — not performed (would write production data). `[Unknown]`
