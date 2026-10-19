# Evidence — Git / repository state

Captured 2026-10-18 during the read-only status audit. Commands: `git status --short --branch`,
`git remote -v`, `git log`, `git branch -a`, `git rev-list --count`. No repository state was modified.

## Branch and remote

```
## staging...origin/staging
origin  https://github.com/shauryaojaswa/gift.git (fetch)
origin  https://github.com/shauryaojaswa/gift.git (push)
```

- Local checked-out branch: `staging`, in sync with `origin/staging`.
- Branches: `main`, `staging` (active), `gh-pages`, `deploy-main`, `cline/58d0e`; remote HEAD → `origin/main`.
- `origin/main` last commit: `cfa06e0` 2026-10-14 `fix(customer-flow): show the wheel label on reward and thank-you screens`.
- `origin/staging` last commit: `6fb04a9` 2026-10-17 `test(qa): full-parallel QA harnesses (sweep, backend e2e, perf, recovery)`.
- **`origin/staging` is 44 commits ahead of `origin/main`** (`git rev-list --count origin/main..origin/staging` = 44).
- `gh-pages` last commit: `22095f4` 2026-10-17 08:35:02 +0530 `chore(pages): refresh GitHub Pages snapshot to v1.3.0 source; keep canonical campaign URL pin`.

## Working tree — uncommitted changes (preserved, untouched by this audit)

```
 M src/features/platform/CatalogPage.tsx
 M src/features/platform/GiftPoolPanel.test.tsx
 M src/features/platform/GiftPoolPanel.tsx
 M src/features/platform/ShopsPage.tsx
 M src/features/platform/api.ts
 M src/features/vendor/Settings.tsx
 M src/lib/data/supabase.ts
 M src/lib/database.types.ts
 M src/types/index.ts
?? artifacts/
?? scripts/audit-customer-visual.mjs
?? scripts/check-wheel.js
?? scripts/check-wheel.mjs
?? scripts/cred-shape.ps1
?? scripts/fetch-api-keys.ps1
?? scripts/probe-qr.mjs
?? scripts/seed-kohinoor.mjs
?? src/features/platform/QrDeliverable.tsx
?? src/features/platform/ShopConfigPanel.test.tsx
?? src/features/platform/ShopConfigPanel.tsx
?? supabase/migrations/20261017150000_gift_price_policy_and_stock.sql
?? supabase/migrations/20261017150100_shop_config_management.sql
```

Interpretation: this is in-progress, uncommitted feature work (gift price policy / stock, shop
configuration panels, QR deliverable, Kohinoor seeding tooling) that predates this audit. It is
**not** on any branch, **not** pushed, and **not** deployed anywhere. The audit did not modify,
commit, or revert any of it.

## Commit timeline relevant to deployment drift (from `git log --date=iso`)

| Commit | Time (+0530) | Subject |
|---|---|---|
| `22095f4` (gh-pages) | 2026-10-17 08:35 | refresh GitHub Pages snapshot to v1.3.0 source |
| `1b75d79` | 2026-10-17 16:02 | fix(rewards): owner Campaign editor saves with valid uuid ids + client onboarding tooling |
| `7d20873` | 2026-10-17 16:53 | test(client-acceptance): --base runs the acceptance matrix against a live origin |
| `e025b5a` | 2026-10-17 20:33 | fix(ui): repair legacy /admin/login crash and standee QR overflow |
| `6fb04a9` (staging tip) | 2026-10-17 | test(qa): full-parallel QA harnesses |

The `gh-pages` snapshot therefore **predates** `1b75d79`, `7d20873` and `e025b5a` by ~12 hours.

## CI / workflows

- No `.github/` directory exists in the working tree or on `origin/main` / `origin/staging`.
- The only workflow in the repository lives on the `gh-pages` branch: `.github/workflows/deploy.yml`
  (see `evidence/deploy-pipeline.md`).

## Build metadata found in tree

- `.vercel/project.json`: `{"projectId":"prj_rlfeEX33QJSfVYW9tprOTd5ocvU3","orgId":"team_p7k5miLIAuPOocPc0TQzfWPm","projectName":"gift"}` (Vercel CLI link, no secrets).
- `vite.config.ts`: `base` is `/gift/` for `npm run build`, `/` for `npm run build:root` (`--mode root`), `/` for dev server.
- `vercel.json`: SPA rewrite `/(.*) -> /index.html`.
- `.env.example` contains two variable **names** only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- `dist/` holds a locally built bundle (rebuilt during this audit to verify build status; no source files changed).
