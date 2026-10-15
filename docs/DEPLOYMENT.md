# JRIQ — Deployment

Last updated: 2026-10-15. Evidence labels: **Verified**, **Reported**, **Unknown**.

## 1. Build targets

One codebase, two explicit build targets. Never edit config files to switch targets.

| Target | Command | Base | SPA fallback | Output use |
|---|---|---|---|---|
| GitHub Pages (current production, rollback) | `npm run build` | `/gift/` | `public/404.html` + `?p=` restore script in `index.html` | Pages artifact via Actions |
| jriq.in domain root (approved future) | `npm run build:root` | `/` | `public/.htaccess` (Apache/LiteSpeed rewrite) | MilesWeb document root upload |

Implementation: `vite.config.ts` selects `base` from the Vite mode
(`--mode root` → `/`, anything else → `/gift/`). `src/features/vendor/lib.ts` derives
public URLs from `import.meta.env.BASE_URL`, so QR links and customer URLs are correct
for both targets automatically (**Verified** in code).

## 2. Release preflight (one command)

```
npm run preflight        # pages target
npm run preflight:root   # root target
```

`scripts/preflight.mjs` runs, in order: dependency check → lint → full unit tests →
TypeScript + production build → environment classification → secret scan (source strict;
build output classified by JWT `role` claim — a service-role key in `dist` fails the gate)
→ base-path verification → SPA fallback artifact check. It prints PASS/FAIL/WARN lines and
**never prints secret values** (presence/length/role only). Exit 0 = safe to publish.

Current results (2026-10-15, local demo-mode env): pages 10/10, root 9/9 (**Verified**).
Warnings about `VITE_*` being unset are expected locally; CI supplies them.

## 3. Environment configuration

Build-time (baked by Vite into the bundle):

- `VITE_SUPABASE_URL` — the Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — the public anon key (safe by design)

**Never** set `VITE_*` to a service-role key. The preflight fails if `dist` contains a
service-role JWT. If both vars are unset the app runs in LocalDataProvider demo mode.

Current values live in the GitHub repository **Actions variables** (Settings → Secrets and
variables → Actions → Variables), consumed by `.github/workflows/deploy.yml` on the
`gh-pages` branch:

- Production: `https://awshkiwqkuubkhecszzk.supabase.co` + its anon key (**Reported** as configured —
  the live site works, so they must be present; verify in the repo settings UI when convenient).
- Do **not** point release builds at staging (`wpytaorgiqkfnifsuhax`) — preflight treats this as FAIL.

## 4. Current production deployment (GitHub Pages)

**Verified** mechanism (from `gh-pages:.github/workflows/deploy.yml`):

1. Source is pushed to the `gh-pages` branch (full source branch, includes the workflow).
2. Push triggers `deploy.yml` → `npm install` → `npm run build` (base `/gift/`, `VITE_*`
   from Actions variables) → `actions/upload-pages-artifact` → `actions/deploy-pages`.
3. Site: https://shauryaojaswa.github.io/gift/ (index cached `max-age=600` — cache-bust when verifying).

Deep links (e.g. `/gift/store/jolly-enterprises`) return a document 404 by design; the
`404.html` SPA-restore + the `index.html` `?p=` restore script bring the client back into
the React route. Both files now also live on `staging` (single source of truth).

To deploy an update today: merge `staging` (or `main`) into `gh-pages`, push, watch the
Actions run to `success`. Transient deploy-job failures have occurred twice historically;
re-running the workflow (or pushing an empty commit) resolved them (**Reported**).

## 5. jriq.in deployment (prepared, not deployed — awaiting approval)

**Reported**: `jriq.in` registered at MilesWeb, expiry 2027-10-14. **Verified**: DNS does
not resolve (2026-10-15). Hosting plan / document root / SSL / upload method: **Unknown** —
requires the user's MilesWeb login (one step at a time).

Prepared artefacts (all **Verified** in repo):

- `npm run build:root` — root-base production build (preflight-verified).
- `public/.htaccess` — SPA rewrite fallback for Apache/LiteSpeed shared hosting.
- `scripts/preflight.mjs root` — the pre-upload gate.

Lowest-effort repeatable deployment once hosting is verified (assumed Apache/LiteSpeed —
confirm before use):

```
npm run preflight:root            # must end RESULT 0 failed
# upload the contents of dist/ to the MilesWeb document root for jriq.in
# (File Manager or FTP — whichever the plan actually supports)
```

Then verify: `https://jriq.in/` (root page), `/store/jolly-enterprises` (deep link),
`/platform/login`, `/vendor/login`, one QR scan, and HTTPS certificate validity.

Automation (optional, later): if the plan supports SSH/SFTP, add a CI job with stored
credentials; **do not assume** any such capability before verifying it.

**Adding a new shop never requires a deployment or DNS change** — shops are data
(slug rows in `stores`), and `/store/<slug>` is a client route (**Verified** in code and
UI tests).

## 6. Rollback

- GitHub Pages remains the canonical deployment until `jriq.in` cutover is approved and
  verified. DNS for `jriq.in` is not delegated yet — nothing to roll back today.
- After cutover: rollback = revert DNS to the current state (or re-publish the previous
  `dist` upload); the Pages deployment keeps serving the old flow independently.
- Database rollback: see `docs/PRODUCTION_RELEASE_PROPOSAL.md` (verified `pg_dump` before
  any migration; additive-only migrations; forward-fix guidance).

## 7. Secrets handling (standing)

- No secrets in the repo, docs, or commit history. `scripts/*.mjs` never print key values.
- Service-role keys are used only in local shell sessions for staging provisioning/cleanup.
- Supabase staging DB password lives only in `%USERPROFILE%\.supabase\jriq-staging.db-password.txt`
  (user-only ACL). Production DB password: never requested in chat; use `pg_dump` prompts.
