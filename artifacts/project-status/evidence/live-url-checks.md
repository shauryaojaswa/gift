# Evidence — Live URL verification (real browser)

Captured 2026-10-18 in a real browser (a11y-tree snapshots, console, network lists).
Legend: HTTP status is for the initial document request unless noted. "App" = SPA rendered.

## 1. https://shauryaojaswa.github.io/gift/ (GitHub Pages root)

- HTTP 200, no redirect. Title: `JRIQ — Spin & Win Rewards for Jewellers`. [Live-test]
- Renders: "JRIQ", "How it works", "For jewellers", "Sign in" → links "Platform Admin", "Shop Owners". [Live-test]
- Console: **0 errors**. All lazy route chunks 200 (`Home-CuPFiWDS.js`, `createLucideIcon-*.js`, …). [Live-test]
- Asset base `/gift/assets/…` — the Pages build (`base=/gift/`). Entry chunk `index-mdbBo4io.js`. [Live-test]

## 2. https://shauryaojaswa.github.io/gift/store/jolly-enterprises (historical QR path)

- Final URL after SPA navigation: `https://shauryaojaswa.github.io/gift/jolly-enterprises`. [Live-test]
- Initial document request shows the spa-github-pages fallback: `200 document /gift/?p=/store/jolly-enterprises` (from `public/404.html`, `pathSegmentsToKeep = 1`). [Live-test]
- App renders customer welcome: "CUSTOMER REWARDS · SPIN & WIN · YOUR REWARD IS WAITING · START", subtitle "60 SECONDS · SIMPLE · REWARD". Console clean. [Live-test]
- Supabase calls against the **production** project `awshkiwqkuubkhecszzk.supabase.co`, all HTTP 200:
  `stores?slug=eq.jolly-enterprises&active=eq.true`, `rewards?store_id=eq.…`, `reward_tiers?store_id=eq.…`,
  `POST /rest/v1/rpc/get_store_gift_pool`. [Live-test]
- Version currency: includes `get_store_gift_pool` (added in the multipool release) → build ≥ v1.2.0. [Live-test / Inference]

## 3. https://shauryaojaswa.github.io/gift/vendor/login (historical)

- HTTP 200, app renders a login **form** (`[form]` + "Sign in" button). Console clean. [Live-test]
- Visible helper copy: "Production sign-in requires a configured Supabase project with an invited
  account mapped to your store. See VENDOR_SETUP.md." — verified in source as always-on helper text
  at `src/features/vendor/VendorLogin.tsx:102`, **not** a demo-mode indicator. [Source-code + Live-test]

## 4. https://shauryaojaswa.github.io/gift/vendor/dashboard (historical)

- Redirects to `/gift/vendor/login` when signed out (session gate). Console clean. [Live-test]

## 5. https://shauryaojaswa.github.io/gift/admin/login (legacy single-shop admin)

- Document 200 (via `?p=/admin/login` fallback), but the app **crashes to a blank page**. [Live-test]
- Console error (verbatim):
  `Error: useAdminAuth must be used within AdminAuthProvider at c (…/assets/AdminContext-DbyiSCf0.js:1:642)`
  with chunks `AdminLogin-CjDMJBcL.js`, `AdminContext-DbyiSCf0.js` loading 200. [Live-test]
- Cross-reference: commit `e025b5a` (2026-10-17 20:33) is titled `fix(ui): repair legacy /admin/login
  crash…` and postdates the Pages snapshot `22095f4` (2026-10-17 08:35) by ~12h. The Pages build
  therefore predates the fix. [Verified fact (git) + Live-test]

## 6. https://shauryaojaswa.github.io/gift/privacy

- Renders the Privacy Policy ("What we collect", "Google Reviews", "Marketing", "Data retention &
  your rights", "Contact"). Console clean. [Live-test]

## 7. https://shauryaojaswa.github.io/gift/no-such-shop-xyz

- Designed 404: "404 · Page not found · Store \"no-such-shop-xyz\" not found · Go to the JRIQ
  homepage · Shop pages live at jriq.in/<shop>". [Live-test]

## 8. https://jriq.in/ (production root domain)

- HTTP 200, title `JRIQ — Spin & Win Rewards for Jewellers`, entry chunk `index-DeRUSe92.js`
  (different hash than Pages — different build target `base=/`, hash difference alone is not
  evidence of source drift). [Live-test]
- Marketing copy includes "Fair, server-assigned rewards — no odds manipulation, ever" and
  "Reward assignment happens on the server before the wheel spins — every claim code is stored and
  verifiable." Console clean. [Live-test]

## 9. https://jriq.in/jolly-enterprises (canonical customer entry)

- App renders the customer welcome. Supabase calls to production project, all 200, including
  `POST /rest/v1/rpc/get_store_gift_pool`. Store row resolves to id `00000000-0000-4000-a000-0000…`
  (a placeholder-UUID shaped tenant id in the production dataset). Console clean. [Live-test]

## 10. https://jriq.in/store/jolly-enterprises (legacy path on root domain)

- **Server-level redirect** to `https://jriq.in/jolly-enterprises` before the SPA loads (consistent
  with `public/.htaccess` 301 documented at `src/App.tsx:29-32`). [Live-test + Source-code]

## 11. https://jriq.in/jolly-enterprises/customer and /costumer (aliases)

- Both render the same customer welcome, **no redirect** (URL preserved), per `src/App.tsx:94-95`. [Live-test + Source-code]

## 12. https://jriq.in/jolly-enterprises/admin (owner workspace, signed out)

- Session gate: after the async auth check the user lands at `/vendor/login` (two observed passes:
  spinner at the slug URL, then `/vendor/login`). Matches `VendorShell.tsx:56-60`. [Live-test + Source-code]

## 13. https://jriq.in/admin/login (legacy admin on production)

- Renders correctly: "Sign in to manage your store's campaign" + "Sign in" button. **No crash** —
  the `e025b5a` fix is present on this origin. Console clean. [Live-test]

## 14. https://jriq.in/platform/login

- Renders the platform sign-in form. Console clean. [Live-test]

## 15. https://jriq.in/standee/jolly-enterprises

- Renders "SCAN & SPIN" standee with QR code image + Google-review QR + "Print Standee", displaying
  the campaign URL `https://jriq.in/jolly-enterprises`. Console clean. [Live-test]

## 16. https://jriq.in/privacy

- Renders the full Privacy Policy (same sections as on Pages). Console clean. [Live-test]

## 17. https://jriq.in/kohinoor (shop that exists only in the staging dataset)

- Designed not-found: "Page not found — Store \"kohinoor\" not found". Production correctly does
  **not** expose the staging-only shop. Console clean. [Live-test]

## 18. https://jriq.in/no-such-shop-xyz

- Designed not-found with the same copy as on Pages. [Live-test]

## 19. https://gift-alpha-pearl.vercel.app/store/jolly-enterprises (historical preview)

- HTTP 200, serves an **older application build**: title `Customer Rewards - Spin & Win` (hyphen),
  older welcome copy "Takes less than 60 seconds · Quick & simple · Spin & Win", entry chunk
  `index-l1l-r0Gv.js`, old route shape `/store/:slug` with no redirect. [Live-test]
- **Zero Supabase requests** in the network log — this build runs the pre-Backend/localStorage demo
  generation of the app. [Live-test]
- Classification: stale, demo-era deployment. No evidence of production data or auth on it. [Inference]

## Safe partial flow on production (write boundary respected)

- On `jriq.in/jolly-enterprises`: WELCOME → START → DETAILS renders (Full name, Purchase amount with
  ₹10K/₹40K/₹1L/₹2.5L chips, Phone) → empty CONTINUE shows inline `[alert]` validation
  ("Please enter your name.", "Please enter your purchase amount.") with **no network write**. [Live-test]
- Source confirms `createSubmission` is invoked on CONTINUE (`DetailsScreen.tsx:118`), so pressing
  CONTINUE with valid data on production would create a production row. The audit **stopped at the
  validation boundary**; no production data was created. [Source-code + Verified fact]

## Screenshot limitation

`browser.screenshot` requires a visible desktop window and failed in this environment
("Screenshot needs a visible tab"). Text evidence (a11y snapshots, console, network) was preserved
instead. [Unknown—blocked: pixel screenshots not captured]
