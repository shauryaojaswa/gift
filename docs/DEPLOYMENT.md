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

> **State finding (2026-10-16, Verified):** the live Pages deployment is **stale**. It
> serves bundle `index-DayxwhG_.js` built from source commit `04a9607` (2026-10-14 —
> **pre-v1.0.0**; no tag contains it). Consequences observed in the v1.1.1 live matrix:
> `/gift/` renders the old single-shop customer page instead of the JRIQ homepage, and
> the client-side canonical redirect for `/gift/store/{slug}` does not exist in that
> build (legacy QR paths still render losslessly there — physical cards keep working).
> Refreshing Pages is the §4 procedure above — a **production-side action awaiting owner
> decision, not executed as part of the v1.1.1 refresh**
> (`docs/FINAL_HANDOVER.md` §12, deviation 10).

## 5. jriq.in deployment (MilesWeb — Phase M)

### 5.1 Hosting facts (2026-10-15/16)

| Fact | Value | Label |
|---|---|---|
| Domain registration | `jriq.in`, Active, due 2027-10-14 | Verified |
| Hosting plan | MilesWeb Premium (mPanel), Active, due 2027-10-17 | Verified |
| Document root | `public_html` | Verified |
| DNS delegation | `luna/odin/neon.mydnsvault.com` | Verified |
| DNS zone | created 2026-10-15 (SOA serial `2026101500`) | Verified |
| A record | `45.199.139.29` (apex `@`) | Verified |
| IPv6 | **No AAAA record** — IPv6-only clients cannot connect | Verified |
| TLS | certificate issued at provisioning, trusted chain, valid to 2027-01-13 | Verified |
| Edge stack | `Server: BitNinja-WafPro`, `Via: 1.1 Caddy` (proxy ahead of the origin web server) | Verified |
| AutoSSL mechanism | issued automatically at site provisioning (mPanel) | Verified (effect) |
| File-size limit | >= 2.26 MB per file accepted (`brand-logo.png` = 2,258,024 B uploaded + byte-verified); server-side ceiling never reached | Verified |
| Upload method | mPanel File Manager HTTP API — authenticated multipart POST over the WHMCS->mPanel SSO session, chunked batches (<= 8 files), `Expect: 100-continue` disabled (the edge closes connections on it). Direct SFTP/FTP auth was rejected server-side on both ports; SFTP-key/FTP-account automation failed; zip+extract unsupported (no server-side route) -> extracted tree uploaded | Verified |
| mod_rewrite / `.htaccess` honoured | **YES** — deep link `/store/jolly-enterprises` returns 200 + the app shell through BitNinja/Caddy; `deploy-verify.ps1` 2026-10-16 | Verified |
| MySQL | account `jriq_in01` exists (mPanel default) — **unused**, JRIQ data lives in Supabase | Verified |

Placeholder handling (upload discipline): `public_html` contained one MilesWeb-managed
file before deployment — `.htaccess` with the block below. It is **deliberately replaced**
by the verified `dist/.htaccess` (byte-identical, sha256-checkable) so the deployed SPA
fallback stays auditable. Displaced content, recorded verbatim:

```
# BEGIN MilesWeb-ErrorPages
ErrorDocument 503 /error_pages/503.html
# END MilesWeb-ErrorPages
```

### 5.2 Deployable artefact + order

The verified `dist/` (root build at `a63ca38`, `index-lQHqJPH9.js`, `preflight:root`
11/11) is deployed **as-is — do not rebuild**. Upload order:

1. `assets/` + favicon/icons/logos/404 (`jriq-assets.zip`, 47 files)
2. `index.html` + `.htaccess` (`jriq-final.zip`) — **LAST**
3. Keep the last 3 asset generations; `index.html` no-cache, hashed assets immutable 1y.

Local staging: `C:\Users\ojaswa\AppData\Local\Temp\opencode\jriq-deploy\`
(SHA256 `jriq-assets.zip` = `95CA529B…9F5DE7`, `jriq-final.zip` = `3870853D…79A5CE`).

Then verify: `https://jriq.in/` (root page), `/store/jolly-enterprises` (deep link —
**the mod_rewrite verdict**), `/platform/login`, `/vendor/login`, one QR scan, and HTTPS
certificate validity. `docs/CUTOVER_CHECKLIST.md` holds the full matrix.

### 5.3 DNS record sheet (MyDNSVault — fill-in block)

Zone `jriq.in` at MyDNSVault. Values below reflect the zone as created by hosting
provisioning (2026-10-15). Adjust here if the zone is edited.

| Name | Type | Value | TTL | Status |
|---|---|---|---|---|
| `@` | A | `45.199.139.29` | 300 — **retained deliberately** (see §5.4) | in place |
| `@` | AAAA | *(none — IPv6 not served)* | — | n/a |
| `www` | CNAME | **recommendation**: CNAME → `jriq.in` with TTL 300, so the apex stays the single source of truth; add only if `www` traffic is expected | 300 | optional |
| `@` | SOA | primary `luna.mydnsvault.com`, serial `2026101500` | 1400 | managed by MyDNSVault |

Cutover TTL discipline: keep TTL 300 through the 60-minute watch; raise to 3600+ only on
a clean window (`docs/CUTOVER_CHECKLIST.md` §7). Rollback repoint: `docs/ROLLBACK.md`.

### 5.4 Deployment actuals + TTL decision (2026-10-16)

Deploy executed 2026-10-15/16 via the mPanel File Manager HTTP API (49 files: 42 assets,
5 root files, then `index.html` + `.htaccess` LAST). One upload defect encountered and
fixed: subdirectory uploads silently vanish unless the target folder exists first —
folder creation is a separate POST (`item_type=folder`). Deployment verification
(`deploy-verify.ps1`): 10 rows — root 200 + app shell + bundle ref, all 4 index-referenced
assets byte-count matched, deep-link SPA fallback 200 (the mod_rewrite verdict), TLS OK.
The cert row asserted an OpenSSL message that Windows curl (Schannel) never prints;
trust is evidenced by Schannel completing without `-k` + `tls` probe `authorized=true`
(valid to 2027-01-13).

**TTL decision (2026-10-16, engineering decision — deliberate deferral):** TTL stays
**300**. Evaluated: (a) browser automation functional but no authenticated MyDNSVault or
mPanel session existed (all expired to login), (b) no MyDNSVault API/credentials in the
environment — the zone is delegated to `luna/odin/neon.mydnsvault.com` and not editable
from mPanel. Rationale: at current traffic the query-volume difference is negligible;
TTL 300 keeps rollback/change propagation at 5 minutes — the operationally safer posture
while the deployment is young. **Revisit: >1000 daily visitors or 90 days stable,
whichever first** — one-minute task: MyDNSVault -> zone `jriq.in` -> A record `@` ->
TTL 300 -> 3600 -> save (same click-path as `docs/FINAL_HANDOVER.md` §11).

Automation (optional, later): if the plan supports SSH/SFTP with per-key auth, add a CI
job with stored credentials; **do not assume** any such capability before verifying it.

**Adding a new shop never requires a deployment or DNS change** — shops are data
(slug rows in `stores`), and `/store/<slug>` is a client route (**Verified** in code and
UI tests).

### 5.5 Release actuals — v1.1.0 and v1.1.1 artifact refresh (2026-10-16)

**v1.1.0** (`7cbe8d6`, tag `v1.1.0`): owner-approved and deployed 2026-10-16. Pre-deploy
logical export 12:43:38 IST (deviation 5 — `pg_dump` egress-blocked), two additive
migrations applied + history-recorded (10 rows), upload of the root build (42 assets +
5 root files + `index.html`/`.htaccess` last), deploy-verify 10/10 (bundle
`index-BKFS76nG.js`), production smoke 35/35, 30-min watch 57/60 (one transient edge/TLS
blip at round 5, 20 min clean after). History reconciliation: `docs/FINAL_HANDOVER.md` §12.

**v1.1.1** (`d3b158a`, tag `v1.1.1`): owner-approved artifact refresh, deployed
2026-10-16 with **zero database changes** (migrations: none needed, none run). Pre-deploy
backup `%USERPROFILE%\backups\jriq\jwellery-20261016-142256.logical.json` (validated —
deviation 8). Upload: 44 assets → 5 root files → `index.html` + `.htaccess` LAST, all
chunks HTTP 201; **byte-verification 50/50 files SHA-256-identical to `dist/`**. Live
bundle `index-ByWVxrmy.js`. deploy-verify **11/11** — including the strict rows: legacy
`/store/{slug}` answers a real HTTP **301** with `Location` exactly `/{slug}` (the
Phase-2 BLOCKED gate, now live evidence), alongside the root-level SPA fallback. Production
smoke 35/35 (zero audit delta); protected claims 2/2 intact; live manual matrix 15/18
(three classified findings, no rollback trigger — `docs/FINAL_HANDOVER.md` §12 deviations
9-10); 30-min watch 10/10 rounds clean (50/50 checks, 09:32 → 09:50 UTC). Rollback
(pre-authorised, not needed): redeploy the previous artifact `7cbe8d6`.

**Upload transport (both releases):** the proven mPanel File Manager HTTP API — WHMCS
login → SSO → multipart `upload_file[]` POSTs, chunked ≤8 files per request,
`Expect: 100-continue` disabled (the edge closes such connections). Target subfolders must
exist before uploading into them (§5.4 quirk). Ordering rule: **`index.html` and
`.htaccess` are always uploaded last**, so a mid-deploy interruption leaves the previous
app fully bootable.

**Byte-verification method:** every fetchable deployed file is fetched over HTTPS and
SHA-256-compared to its local `dist/` counterpart (50 files at v1.1.1, `index.html`
included). `.htaccess` cannot be served over HTTP by design; its verification is
behavioural (the strict 301 rows of `deploy-verify.ps1` / `cutover-watch.mjs`).

## 6. Rollback

- **2026-10-16: cutover complete — `jriq.in` (MilesWeb) is PRIMARY; GitHub Pages
  `/gift/` is the honored fallback**, kept live and warm, never decommissioned.
- Rollback = repoint the `jriq.in` apex A record at the Pages origin (TTL 300 -> changes
  propagate in <= 5 min), exact steps in `docs/ROLLBACK.md`. Note the Pages artefact is
  `/gift/`-based: the apex cannot render it — printed QR codes point at
  `shauryaojaswa.github.io/gift/...` and are never at risk. Alternative: re-publish the
  previous `dist` upload to `public_html` (keep-last-3 asset generations + the zips in
  `C:\Users\ojaswa\AppData\Local\Temp\opencode\jriq-deploy\`).
- Database rollback: see `docs/PRODUCTION_RELEASE_PROPOSAL.md` (verified `pg_dump` before
  any migration; additive-only migrations; forward-fix guidance).

## 7. Secrets handling (standing)

- No secrets in the repo, docs, or commit history. `scripts/*.mjs` never print key values.
- Service-role keys are used only in local shell sessions for staging provisioning/cleanup.
- Supabase staging DB password lives only in `%USERPROFILE%\.supabase\jriq-staging.db-password.txt`
  (user-only ACL). Production DB password: never requested in chat; use `pg_dump` prompts.
