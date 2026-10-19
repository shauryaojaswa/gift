# Evidence — Deployment pipeline and hosted origins

## GitHub Pages pipeline ([Verified fact] from `git show gh-pages:.github/workflows/deploy.yml`)

- Trigger: `push` to branch `gh-pages`, or `workflow_dispatch`.
- Job: checkout `gh-pages` → Node 22 + npm cache → `npm install` → `npm run build` (Vite,
  `base=/gift/`) → upload → deploy to GitHub Pages.
- Build-time environment (from **Actions variables**, never secrets in the repo):
  - `VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}`
  - `VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}`
    (workflow comment: "anon key is safe by design; never the service-role key"; if unset the app
    "truthfully falls back to LocalDataProvider (demo mode)")
  - `VITE_PUBLIC_APP_URL: https://jriq.in` — "Canonical campaign host: printed QR artefacts must
    decode to exactly https://jriq.in/{slug} on every surface, including this fallback host."
- Concurrency group `pages`, `cancel-in-progress: true`. Permissions: `contents: read`,
  `pages: write`, `id-token: write`.
- Note: the workflow file exists **only on the `gh-pages` branch**, which also holds a full source
  snapshot (`src/`, `package.json`, `public/`, `supabase/`). The branch is pushed wholesale and the
  workflow builds it. [Verified fact]

## SPA deep-link fallback (GitHub Pages)

`public/404.html` (spa-github-pages trick, MIT): converts a deep-link path to a query string
(`?p=/…`) and redirects so `index.html` can restore the URL client-side. `pathSegmentsToKeep = 1`
keeps the `/gift/` segment. The file carries an **old** `<title>Customer Rewards - Spin &amp; Win</title>`,
which is why deep links on Pages briefly show the legacy title. [Verified fact + Live-test]

## Root-domain hosting (jriq.in)

- `public/.htaccess` performs a real **HTTP 301** for `/store/:slug` before the SPA loads
  (documented at `src/App.tsx:29-32`; live-verified on jriq.in). [Source-code + Live-test]
- `vercel.json` contains a catch-all SPA rewrite `/(.*) → /index.html`. [Verified fact]
- `.vercel/project.json` links this checkout to Vercel project `gift`
  (`prj_rlfeEX33QJSfVYW9tprOTd5ocvU3`, team `team_p7k5miLIAuPOocPc0TQzfWPm`). [Verified fact]
- Which branch/trigger Vercel deploys from is **not determinable from the repository alone**
  (no Vercel Git config committed). jriq.in serves a build containing the `e025b5a` fix (live
  evidence), i.e. deployed from source ≥ 2026-10-17 20:33. [Unknown—blocked: deploy trigger /
  branch] [Live-test + Inference for version floor]

## Two build targets (`vite.config.ts`)

| Command | `base` | Target |
|---|---|---|
| `npm run build` | `/gift/` | GitHub Pages project site |
| `npm run build:root` | `/` | jriq.in (root domain) |
| `npm run dev` / `preview` | `/` (serve) | local |

`src/main.tsx` derives the router basename from `BASE_URL`, so one source serves both bases.
QR/campaign URLs are pinned to `https://jriq.in/{slug}` via `VITE_PUBLIC_APP_URL` so prints remain
canonical regardless of which host serves the app. [Source-code]

## Supabase environments (identifiers only; keys never printed)

- Production project ref `awshkiwqkuubkhecszzk` — observed in live network logs of the deployed
  apps (public config shipped in the JS bundle). [Live-test]
- A separate staging project exists in the working conventions of this workspace; this audit made
  **no calls that write** to either environment. [Verified fact]
