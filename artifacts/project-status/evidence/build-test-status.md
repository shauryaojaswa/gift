# Evidence — Local build and test status

Captured 2026-10-18 during the read-only audit. Commands run against the working tree as-is
(including the uncommitted in-progress work). No source files were modified.

## Unit / component tests

```
npx vitest run
 RUN  v5.0.3 C:/Users/ojaswa/Desktop/gift
 Test Files  27 passed (27)
      Tests  359 passed (359)
   Duration  9.54s
```

**Result: 359/359 passing across 27 test files.** [Verified fact]

Coverage of note (file names from `src/**/*.test.*`): reward-engine (3 suites incl. boundaries and
pool), wheel-math, validation, slugs, theme, GiftPoolPanel, ShopConfigPanel, SpinWinScreen
(asserts `createSubmission` is *not* re-called for a saved assignment), and others.

## Type check + production build

```
npx tsc -b --pretty false   -> clean, no errors
npm run build               -> tsc -b && vite build
✓ built in 8.13s
dist/assets/index-1HYejvSL.js        311.11 kB │ gzip: 98.11 kB
dist/assets/CustomerFlow-DTtMbZOl.js  48.27 kB │ gzip: 15.40 kB
dist/assets/AdminShell-B-dZxJKr.js    37.74 kB │ gzip:  8.90 kB
```

**Result: type check clean, production build succeeds.** [Verified fact]

This build was produced **without** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the
environment, so per `src/lib/data/index.ts` it resolves to `LocalDataProvider` (demo mode).
That property was used deliberately to run a complete customer journey with **zero backend
writes** (see `demo-flow-walkthrough.md`).

## Lint

Not re-run during this audit. A previous session recorded `npm run lint` (oxlint) with 0 errors
and pre-existing warnings. [Unknown—blocked for this audit: not re-verified]

## Tooling scripts visible in `package.json`

| Script | Command | Purpose (from inspection) |
|---|---|---|
| `dev` | `vite` | dev server at `/` |
| `build` | `tsc -b && vite build` | GitHub Pages build (`base=/gift/`) |
| `build:root` | `tsc -b && vite build --mode root` | root-domain build (`base=/`) for jriq.in |
| `preflight` / `preflight:root` | `node scripts/preflight.mjs pages|root` | pre-deploy checks |
| `test` | `vitest run` | unit/component tests (happy-dom) |
| `lint` | `oxlint` | lint |
| `preview` | `vite preview` | serve the built bundle |

## Environment quirk recorded during live testing (tooling, not app defect)

`vite preview` on :4173 returned 404 for JS module subresource requests through the harness
browser proxy while the identical URL returned 200 on direct navigation and HEAD requests.
A plain static file server on :4180 serving the same `dist/` returned 200 for all assets and the
app ran normally. Classified as a preview-server/proxy interaction artifact. [Live-test result]
