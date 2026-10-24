# Route matrix — https://jriq.in (live production)

Audited 2026-10-19 against the deployed SPA (`index-Ca_27p6s.js`) and the
production Supabase project `awshkiwqkuubkhecszzk`.

**Result of the automated route/auth sweep on this release: 31/31 PASS**
(`scripts/live-route-audit.mjs` → `route-audit.md`, ids RA-001…RA-031), plus
**50/50 PASS** on the project's read-only visual/boundary audit
(`scripts/live-visual-readonly.mjs`) and **35/35 PASS** on the production smoke
store (`scripts/prod-smoke.mjs`). No console errors and no failed requests were
observed on any public page.

Legend for **Access**: `public` · `customer` (public entry, authenticated
submission) · `vendor` (shop owner, session + store membership) · `platform`
(internal platform admin) · `legacy` (single-shop era, kept working).

| # | Route | Access | Expected result | Functional outcome | Security checks | Performance notes | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|
| 1 | `/` | public | Platform home, shop discovery | PASS | no tenant data | measured (Deliverable C) | `route-audit.md` RA-001 | – |
| 2 | `/privacy` | public | Privacy policy | PASS | static | – | RA-002 | – |
| 3 | `/{slug}` (pashupati1 / pashupati2 / pashupati / bcy / jolly-enterprises / shreejwellers / shreemanali) | public + customer | Branded storefront → details → review → wheel → reveal | PASS (7 shops) | `stores`/`rewards` are public-by-design customer reads; submissions are not | measured per shop | RA-003..009 + journey runs | – |
| 4 | `/{slug}/costumer`, `/{slug}/customer` | public | Customer aliases render the same shop | PASS (routing) | same as #3 | – | App.tsx route table | – |
| 5 | `/standee/{slug}` | public | QR standee with the store's own QR + brand | PASS | no tenant data | measured | RA-010/011 | – |
| 6 | `/store/{slug}` (legacy) | public | Real HTTP 301 → `/{slug}` | PASS | – | – | deploy-verify + RA-017 | – |
| 7 | `/vendor/login` | public | Shared sign-in screen (branded per store when the URL identifies one) | PASS | no credential exposure; login-ID resolution server-side | measured | RA-014, RA-028..031 | – |
| 8 | `/{slug}/admin` | vendor | Owner workspace for that store only | PASS | 403 wall + backend refusal for other stores | measured | RA-018, RA-022..027 | – |
| 9 | `/{slug}/admin/dashboard` | vendor | Overview (customers, gifts, review clicks) | PASS | own-store data only | – | RA-022/023 | – |
| 10 | `/{slug}/admin/customers` | vendor | Customer records, filters, CSV export | PASS | own-store rows only; export respects the same scope | – | settings post phase | – |
| 11 | `/{slug}/admin/rewards` | vendor | 8 gift fields (ladder) or gift columns + purchase tiers | PASS | own-store config only | – | admin phase | – |
| 12 | `/{slug}/admin/qr-code` | vendor | Store QR code (canonical app URL) | PASS | own-store asset | – | surface checks | – |
| 13 | `/{slug}/admin/settings` | vendor | Store settings incl. Google Review URL | PASS | own-store only; other stores 403 | – | settings pre/post phases | – |
| 14 | `/platform/login` | platform | Platform admin sign-in | PASS (renders) | platform surface, separate account | – | RA-012 | signed-in platform flows BLOCKED (no authorised credential) |
| 15 | `/platform/shops` | platform | Shop list, status, gift catalogue | BLOCKED | RLS + `is_platform_admin()` server-side | – | – | no authorised platform credential available for this audit |
| 16 | `/platform/catalog` | platform | Gift catalogue CRUD | BLOCKED | as above | – | – | idem |
| 17 | `/admin/login` | legacy admin | Legacy single-shop admin sign-in | PASS (renders) | – | – | RA-013 | – |
| 18 | `/admin/*` | legacy admin | Legacy admin panel | PASS (renders) | – | – | RA-013 | – |
| 19 | `/dashboard/*` | legacy admin | Redirects to `/admin` | PASS | – | – | App.tsx | – |
| 20 | `/vendor/*` (legacy) | vendor | Redirects into the slug-scoped flow | PASS | – | – | App.tsx | – |
| 21 | `/{unknown-slug}` | public | Designed 404 — never another shop | PASS | no shop data leak | – | RA-015 | – |
| 22 | `/{slug}/admin` while signed in as another store | vendor | 403 "This dashboard belongs to another shop" | PASS | 403 wall, zero other-shop metrics | – | RA-024/025 | – |
| 23 | `/{slug}/admin/*` without a session | vendor | Redirect to the sign-in screen | PASS | – | – | RA-018 | – |
| 24 | Deep-link refresh on a nested route (e.g. `/pashupati1/admin/settings`) | vendor | SPA fallback serves the app, session restored | PASS | – | – | RA-023 | – |
| 25 | Review CTA destination (`Leave a Google Review`) | customer | Opens that store's own saved review URL | PASS | external navigation only | – | journey phase | – |
| 26 | Reward wheel reveal + claim code | customer | Engine-assigned reward + claim code, ~5 s spin | PASS | reward decided server-side | measured 5089/5105 ms | journey phase | – |
| 27 | Invoice prompt (last prompt of the form) | customer | Optional; empty → NULL, value persisted | PASS | own submission only | – | journey + settings post | – |
| 28 | CSV export (`/{slug}/admin/customers`) | vendor | Ends with the final `Invoice Details` column | PASS | export scoped to own store | – | settings post | – |

## Discovered during browser exploration

- The customer storefront is reachable through three URL shapes (canonical
  `/{slug}` plus the shop-requested `/costumer` and `/customer` aliases); they
  render the same shop record and the same reward flow.
- `/{slug}/admin` is the only vendor entry; the legacy `/vendor/*` and
  `/admin/*` trees redirect into it.
- Two admin URLs that are not in the router: `/.well-known/*` and the
  static `404.html`/`robots.txt`/`sitemap.xml` files served by the host.
