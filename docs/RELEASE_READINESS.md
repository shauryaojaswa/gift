# JRIQ — Release Readiness Report (Phase 9)

Prepared: 2026-10-15. Status: **AWAITING EXPLICIT USER APPROVAL**. No production
change, DNS change, billing change, or deployment has been executed. GitHub Pages
(`gh-pages`, base `/gift/`) remains the live site and the rollback target.

Labels: **VERIFIED** (command/browser evidence this session) · **REPORTED** (user or
vendor documentation) · **INFERRED** · **UNKNOWN**.

---

## A. Verified current state

| Fact | State | Label |
|---|---|---|
| Branch / tree | `staging`, clean, HEAD `50fda24` | VERIFIED |
| Remote | `origin/staging` = `50fda24`; `main` = `cfa06e0`, `gh-pages` = `4b0f17a` untouched | VERIFIED |
| Production project | `jwellery` / `awshkiwqkuubkhecszzk`, ACTIVE_HEALTHY, PG 17.6.1, ap-northeast-2 | VERIFIED (CLI) |
| Staging project | `jriq-staging` / `wpytaorgiqkfnifsuhax`, ACTIVE_HEALTHY | VERIFIED (CLI) |
| Prod schema vs staging | 10 shared tables identical incl. `submissions`; `reward_tiers.reward_id` NOT NULL in prod (loosened by pending migration 3); `rewards.catalog_gift_id` absent (added by migration 1); JRIQ tables absent (pending) | VERIFIED (live `gen types` diff) |
| Prod schema extras | 16 tables not in repo migrations (`orders`, `gold_schemes`, `invoices`, `customers`, `products`, `tenants`, `users`, …) + `get_user_tenant_id()` — pre-existing application data, untouched by all 4 JRIQ migrations | VERIFIED (diff) |
| RPC contracts | `submit_customer_entry` and `save_store_tiers` Args/Returns **identical** prod ↔ staging → deployed frontend keeps working | VERIFIED (diff) |
| Prod migration history | **exactly 3 entries** — `initial_schema`, `managed_tenant_foundation`, `submissions_collection_index` (10 Oct 2026) — matching local; the 4 JRIQ files are exactly what is pending | VERIFIED (dashboard) |
| Rate-limit timezone | rolling `now()`-based 1-hour window — timezone-independent; no `current_date` daily-cap logic exists; `current_date` appears only in subscription trial/renewal checks (self-consistent) | VERIFIED |

### jriq.in — five separate facts

| Fact | State | Label |
|---|---|---|
| Registration | Active (add period), registered 2026-10-14 15:22 UTC, expires 2027-10-14; registrar of record **Hosting Concepts B.V. dba Openprovider (IANA 1647)** — sold via MilesWeb reseller; domain id 74851 in the MilesWeb client area | VERIFIED (RDAP + client area) |
| DNS | Delegation **is configured**: `luna/odin/neon.mydnsvault.com`. Resolution **fails (SERVFAIL)** — the DNS zone at MyDNSVault was never created. (Corrects the earlier "nameservers unconfigured" note.) | VERIFIED (RDAP + resolver probes) |
| Hosting | MilesWeb "Premium" shared plan, Active, bound to jriq.in, due 2027-10-14. 25 GB NVMe, unmetered bandwidth, daily backups, free SSL per website, 100 subdomains, mPanel | VERIFIED (client area + public specs REPORTED) |
| SSL | Not issued (no site space exists yet). Free SSL included in the plan | UNKNOWN until provisioning |
| Live deployment | Not live. GitHub Pages at `/gift/` is the live app | VERIFIED |

## B. Plan-tier recommendation (own line item — decision required from you)

**Supabase plan tier: VERIFIED Free** — org "shauryaojaswa's Org" is on the Free plan;
`jwellery` (and `jriq-staging`) show as "NANO". Verified 2026-10-15 in the dashboard:
**no project backups, no PITR** ("Free Plan does not include project backups. Upgrade
to the Pro Plan for up to 7 days of scheduled backups."); DB size 29 / 500 MB; MAU
44 / 50,000. Auto-pause applies to idle free projects (two other projects are already
paused), so a quiet production project can pause after ~7 idle days — every test result
against a paused project is invalid, and a paused site is downtime.

**Recommendation (NOT executed — billing changes need your explicit approval):**
upgrade `jwellery` to **Pro ≈ US$25/month** (Supabase pricing, verify on the billing
page). What it changes: removes auto-pause, adds daily backups + 7-day PITR, raises
limits, enables SOC2-grade support. Alternatives: (a) stay Free and accept the
pause/backup risk with a scheduled weekly keep-alive and manual `pg_dump` discipline;
(b) Pro only after launch traffic proves the need. My recommendation: **upgrade before
launch** — an unbackupable claims ledger is the one risk you cannot fix after the fact.

## C. Migration plan

Ordered (dependency: 1 → 2 → 3 → 4; each file is transactional in Postgres — a failing
file rolls back cleanly. Apply all four **in one session** if using `db push`/SQL so a
partial sequence never serves traffic):

| # | File | Contents (complete) | Expand-only |
|---|---|---|---|
| 1 | `20261015161000_platform_catalog_policies.sql` | new tables `gift_catalog`, `platform_policies` (seeds `default_brackets`), `store_owner_invitations`; `rewards.catalog_gift_id uuid` nullable + FK `on delete restrict`; 2 partial unique/normal indexes; `sync_catalog_gift_to_rewards()` + `touch_updated_at()` triggers; RLS + grants + 5 policies; audit triggers. The only `UPDATE rewards` is **inside** the trigger function body (future catalogue edits) | YES |
| 2 | `20261015161100_tier_gift_options.sql` | `ADD CONSTRAINT reward_tiers_store_id_key UNIQUE (store_id, id)` (id is PK ⇒ trivially satisfied by existing rows); new table `tier_gift_options` + 2 indexes + RLS + policy + 2 triggers | YES |
| 3 | `20261015161200_reward_engine_multipool.sql` | `reward_tiers.reward_id DROP NOT NULL` (the only column alteration, non-destructive); `CREATE OR REPLACE` 6 functions (`submit_customer_entry` contract identical — VERIFIED; legacy fallback preserved at lines 198–206; pool = uniform `ORDER BY random()`); grants per function (`REVOKE … FROM public` + narrow `GRANT`) | YES |
| 4 | `20261015170000_anon_grant_tightening.sql` | permission-only `REVOKE`/`GRANT` on platform tables; anon keeps `SELECT gift_catalog` and **all** public-flow access to `stores`/`submissions`/`rewards`/`reward_tiers`; public submissions run through the `SECURITY DEFINER` RPC unaffected | YES |

**Expand-only verdict: all 4 YES.** No `DROP TABLE`, `TRUNCATE`, `DELETE`, `NOT NULL`
addition, or data rewrite at migration time. Frontend rollback to GitHub Pages stays safe.

**Drift findings:** production carries 16 extra pre-existing tables not represented in
repo migrations (likely created outside migration history — possibly via the Base44
path seen in branch `base44/setup-0c306f20`). The JRIQ migrations neither touch nor
conflict with them (name-level and behaviour-level, VERIFIED by inventory). If
`supabase_migrations.schema_migrations` on production is empty or partial, `db push`
would re-run legacy files — so step 1 of execution is to read migration history from the
dashboard and, if it disagrees, apply the 4 files **manually in order via the SQL
editor** instead of `db push`. Reconciliation of prod migration history = capture it,
compare to the 7 local files, and record findings before any apply.

**Timezone:** no fix required (VERIFIED — rate limiting is a rolling `now()` window;
no business-day `current_date` caps exist).

**Template scope:** `default_brackets` is read only by `create_shop` (new shops);
the existing shop's 8 tiers/rewards/submissions are never rewritten (immutability
harness-verified on staging).

## D. Backup — three separate states

| State | Status |
|---|---|
| PREPARED | ✅ Procedure + commands written (`docs/PRODUCTION_RELEASE_PROPOSAL.md` §6/§15); baseline capture script ready (`scripts/prod-baseline.sql`, PII-free output) |
| COMPLETED | ✅ **VERIFIED 2026-10-15** — see "Backup execution 2026-10-15 (Part 1)" below |
| RESTORE-TESTED | ✅ **CLEAN 2026-10-15** — see "Restore test 2026-10-15" below (item-by-item baseline diff + destruction evidence) |

**Historical note (superseded):** an earlier network block on Supabase DB ports (5432/
6543) made `pg_dump`/`pg_restore`/`supabase migration up` impossible from this machine.
Resolved by running DB work from a phone hotspot (egress re-verified 2026-10-15).

## Baseline 2026-10-15 (pre-migration evidence — captured VERIFIED, read-only)

Captured via the Supabase dashboard's authenticated query API against production
(`jwellery` / `awshkiwqkuubkhecszzk`) — SELECT-only statements. **PII excluded**: no
customer names, phones, or emails in the outputs below (owner mapping records store
ids only). Post-migration verification (release step 5) compares against exactly this.

**Migration history (3 applied):**
`20261010202900 initial_schema` · `20261010203000 managed_tenant_foundation` ·
`20261010203100 submissions_collection_index`

**Row counts (all 26 public tables):**

| Table | Rows | Table | Rows |
|---|---|---|---|
| stores | 1 | activity_log | 0 |
| store_admins | 1 | categories | 0 |
| platform_admins | 0 | customers | 0 |
| rewards | 8 | digital_gold_transactions | 0 |
| reward_tiers | 8 | gold_leases | 0 |
| submissions | 1 | gold_rate_quotes | 0 |
| public_submission_rate_limits | 4 | gold_schemes | 0 |
| store_subscriptions | 0 | invoices | 0 |
| subscription_plans | 0 | metal_rates | 0 |
| platform_audit_logs | 27 | order_items | 0 |
| — | — | orders | 0 |
| — | — | products | 0 |
| — | — | promotions | 0 |
| — | — | scheme_installments | 0 |
| — | — | tenants | 0 |
| — | — | users | 0 |

Notes: `public.collections` does **not exist** (`to_regclass` = null — collections are
modelled as `submissions.collection_status`). `platform_admins` is empty (platform
admin provisioning happens with the JRIQ migrations).

**Protected claim (PII-free columns):** id `ddd89040-453d-4018-bab3-7ee445e72e83`,
store `00000000-0000-4000-a000-000000000001`, tier `00000000-0000-4000-b000-0000000000b4`
(50,000–100,000), reward `00000000-0000-4000-a000-0000000000a4`, claim code
`GIFT-DDD89040`, purchase ₹50,000, `reward_label` = `PREMIUM GIFT`,
`reward_wheel_label` = `PREMIUM GIFT`, prefix `GIFT`, `collection_status` = `awaiting`,
created 2026-10-14 11:16:56 UTC.

**Existing shop:** slug `jolly-enterprises`, name `CUSTOMER REWARDS`, status `active`,
active = true, `min_spin_amount` = 10000 — tiers **8**, rewards **8**.

**Owner mapping:** `oj@gmail.com` → store `00000000-0000-4000-a000-000000000001`
(role `owner`). `platform_admins`: no rows.

**RPC signature fingerprint (`pg_proc.proargtypes`, the durable frontend contract):**
- `save_store_tiers` — 1 arg, `proargtypes = 3802` (json)
- `submit_customer_entry` — 7 args, `proargtypes = 25 2950 25 25 23 16 16`
  (text, uuid, text, text, int4, bool, bool)

**DB timezone:** `UTC` (`current_date` = 2026-10-15) — rate limiting is `now()`-rolling-
window based and timezone-independent (already verified); subscription date checks use
`current_date` self-consistently.

**Billing:** Pro upgrade **HELD by user 2026-10-15** (checkout reached "Confirm upgrade",
$25.00/month shown, no card on file; user chose to defer). Plan remains **Free** —
no backups/PITR and auto-pause risk stand as recorded in §B. The `pg_dump` backup below
is therefore the only recovery path and is mandatory before any migration.

**Production DB credentials (2026-10-15):** the production DB password was reset via the
Supabase dashboard and captured end-to-end **without transiting chat** (page-side
generation → browser download → moved to the session password file
`%USERPROFILE%\.supabase\jwellery.db-password.txt`; the unused interim receiver was shut
down and its script deleted). Authenticated successfully via
`supabase migration list --project-ref awshkiwqkuubkhecszzk` — which also re-confirmed
**3 migrations applied / 4 JRIQ files pending** directly from the database. Note: the
local Supabase link intentionally remains on staging; all production commands use the
explicit `--project-ref` / connection string.

## Backup execution 2026-10-15 (Part 1)

**Pre-write safety (VERIFIED):** backup directory `C:\Users\ojaswa\backups\jriq` is
**local-only** — plain directory, no reparse point, outside the OneDrive root; Desktop/
Documents are not cloud-redirected (no folder-backup sync covers it). The production
password session file is distinctly named from the staging one and lives outside the
repo tree (existence only — contents never referenced).

**COMPLETED (VERIFIED):** `pg_dump (PostgreSQL) 17.11`, target re-verified aloud as
`jwellery` / `awshkiwqkuubkhecszzk` immediately before the dump. Password supplied only
via the session file into the process environment (never on a logged command line).
- Data: `jwellery-20261015-150511.dump` — 416,184 bytes, written 2026-10-15T15:06:13
  (`pg_dump --format=custom --no-owner --no-privileges`, exit 0)
- DDL: `jwellery-schema-20261015-150511.sql` — 296,904 bytes (exit 0)
- Integrity: `pg_restore --list` → 653 TOC entries, **exit 0**, no warnings

**RESTORE-TESTED:** see the dated restore-test result below (item-by-item baseline diff).

### Free-tier consequence — operational requirements (Pro upgrade held 2026-10-15)

With no Supabase backups/PITR on the Free plan, **`pg_dump` is the sole recovery path**.
Until Pro is enabled, the following recurring discipline is required:

1. **Weekly dump** (same command shape as above): data dump + `--schema-only` snapshot
   into `C:\Users\ojaswa\backups\jriq\`, timestamped filenames.
2. **Rotation: keep the last 4** weekly dumps (≈1 month of history); never delete or
   overwrite a dump that hasn't been superseded by a newer *verified* one.
3. **Every run:** `pg_restore --list` must parse with exit 0; the newest dump is only
   considered "verified" after that check passes.
4. **Production keep-alive (pre-launch):** free projects auto-pause after ~7 idle days.
   Until real traffic exists, open the app/API against production at least weekly (e.g.
   one read query) to prevent an unintended pause — a paused project means downtime and
   invalidates any test result.
5. **Dated note: revisit the Pro upgrade (≈$25/mo) after launch** — daily backups +
   7-day PITR + no auto-pause remove the entire class of risk above.

## Restore test 2026-10-15 (RESTORE-TESTED — CLEAN)

**Method:** disposable local PostgreSQL 17.11 cluster (`initdb`, trust auth,
`127.0.0.1:55432`, data directory `%LOCALAPPDATA%\Temp\jriq-restoretest-pgdata` — a
local-only path, never the backup directory), `pg_restore` of
`jwellery-20261015-150511.dump`, item-by-item baseline diff, then destruction with
verification. Nothing touched production; the backup artifacts were never modified
(re-verified byte sizes after the test).

**Final run environment (all VERIFIED):**
- Cluster encoding **UTF8** (`initdb -E UTF8 --locale=C`) — matches production.
- Supabase default roles `anon`, `authenticated`, `service_role` created (NOLOGIN) —
  a real Supabase recovery target has these; policies reference them.
- Restore TOC list = the dump's full 653 entries **minus exactly 4 Supabase-Vault
  platform entries** (named below), written via `pg_restore --list` → `-L` filter.
- `pg_restore --no-owner --no-privileges -L <filtered>`: **exit 0, 0 errors**.

**Excluded entries (Supabase-only extension; cannot exist on stock PostgreSQL — a real
Supabase recovery target restores them unchanged):**
1. `SCHEMA - vault supabase_admin`
2. `EXTENSION - supabase_vault`
3. `COMMENT - EXTENSION supabase_vault`
4. `TABLE DATA vault secrets supabase_admin`

**Item-by-item baseline diff (restored DB vs. the pre-migration baseline above) — all
rows match exactly:**

| Item | Restored value | Verdict |
|---|---|---|
| `schema_migrations` | exactly 3: `20261010202900 initial_schema`, `20261010203000 managed_tenant_foundation`, `20261010203100 submissions_collection_index` | ✅ match |
| stores / store_admins / platform_admins | 1 / 1 / 0 | ✅ match |
| rewards / reward_tiers / submissions | 8 / 8 / 1 | ✅ match |
| public_submission_rate_limits / platform_audit_logs | 4 / 27 | ✅ match |
| 16 legacy tables (activity_log … users) | all 0 | ✅ match |
| Protected claim `GIFT-DDD89040` | id `ddd89040-…-7ee445e72e83`, store `…0001`, tier `…00b4`, reward `…00a4`, amount 50000, labels `PREMIUM GIFT`/`PREMIUM GIFT`, prefix `GIFT`, status `awaiting`, created 2026-10-14 11:16:56 UTC | ✅ byte-identical |
| Shop `jolly-enterprises` | active, `min_spin_amount` 10000, 8 tiers, 8 rewards | ✅ match |
| Owner mapping | `oj@gmail.com` → store `…0001`, role `owner` | ✅ match |

**Destruction evidence (reported separately from the two states above):**
`pg_ctl stop -m fast` exit 0 → data directory deleted → `Test-Path` = **False**; no
processes referencing the test cluster/DB remain; port 55432 no longer listening;
backup artifacts intact (`jwellery-20261015-150511.dump` 416,184 bytes,
`jwellery-schema-20261015-150511.sql` 296,904 bytes).

**Failed attempts recorded honestly (all test-bench/tooling causes — none were dump
corruption):**
1. Runs 1–3 wedged at server start: PowerShell 5.1 pipeline/stream-drain waits block
   forever once `pg_ctl` daemonizes (the spawned server inherits the pipe/stream
   handles). Fix: start via `Start-Process` and poll `HasExited`; drive the rest in the
   foreground. Harness scripting bug, not a data issue.
2. Run 4 restored into a cluster created with the default Windows codepage (`WIN1252`):
   `COPY rewards`/`schema_migrations` failed on `0xe2 0x82 0xb9` (₹, U+20B9, valid
   UTF-8 in the dump), cascading into `reward_tiers` FK failures — which is precisely
   what the item diff caught (`rewards 0` vs baseline 8). Fix: UTF-8 cluster.
3. Run 5 failed on `role "authenticated" does not exist` (19 policy statements) —
   stock PostgreSQL lacks Supabase's platform roles. Fix: create them (NOLOGIN).

**Restore gate CLOSED CLEAN. Migration and cutover phases are authorised to proceed.**

## E. Frontend readiness

- Release candidate: annotated tag **`v1.0.0`** → commit **`a63ca381dfb6e01182cbfa1e333268a131106fb5`**
  (pushed and verified via `git ls-remote`; the tag was created before the SHA line in
  this file was filled in — the tag's code content is the tested tree; the only later
  change was this docs line). The approval gate approves this tag, not a moving branch.
- Evidence on that revision (docs-only delta from the tested tree): `npm test` 216/216,
  `npm run lint` 0, `npx tsc -b` 0, `npm run build` 0 (base `/gift/`), `npm run build:root`
  0 (base `/`), `preflight` 10/10, `preflight:root` 9/9, staging-verify 70/70,
  ui-verify 27/27 (screenshots `%TEMP%\jriq-ui-evidence`), secret scan clean
  (no `service_role`, no staging URL in release builds, no credentials in artefacts).
- Router basename follows `BASE_URL`; wheel reveals the server-saved result in both
  legacy and pool paths (UT + UI); QR uses the store slug (UI).

## F. Deployment (Phase E outcome)

- **Decision rule status: MilesWeb preferred but NOT YET WON.** SPA fallback (#7/#8)
  and repeatable deploy (#6/#9) cannot be verified because **no website space is
  provisioned** — mPanel only offers the "add website" wizard (I did not provision
  anything; that is a deployment action and awaits approval).
- Verified: hosting plan exists and is adequate (25 GB, unmetered, free SSL, backups);
  domain is bound to the account; DNS is editable from the client area (MyDNSVault).
- Unknown until provisioning: document root, mod_rewrite/.htaccess honouring, AutoSSL,
  SFTP/SSH availability, single-file upload caps, deep-link 200 behaviour.
- **Fallback rule stands:** if SPA fallback or SSL cannot be verified, GitHub Pages
  stays primary and MilesWeb is parked (with a support ticket) — stated outcome will be
  recorded at deployment time. GitHub Pages is live throughout.

## G. Risks

| Risk | Severity | Note |
|---|---|---|
| Free-tier auto-pause / no backups (if prod is Free) | High | §B decision |
| DB egress blocked → backup/migration tooling unusable from this network | High | §D options |
| Prod migration history may not match repo (Base44-era extras) | Medium | use SQL editor path; read history first |
| SPA fallback unverified on MilesWeb | Medium | decision rule → Pages fallback |
| Sync-trigger behaviour on future catalogue edits | Low | harness-verified immutability |
| Pages deploy transient failures | Low | re-run workflow (seen before) |

## H. Rollback

- Frontend: GitHub Pages never goes down during the MilesWeb cutover — repoint DNS back
  to the Pages origin (minutes, because TTL is lowered to 300s first). For the Pages
  release itself, redeploy the previous `gh-pages` commit. Rehearsed: frontend swap on
  staging-equivalent builds (VERIFIED build/preflight), DNS rollback NOT rehearsed
  (requires live DNS).
- Database: additive migrations need no rollback for frontend rollback to work (§C).
  If data corruption ever occurred: restore the verified `pg_dump` (reverts everything
  since the dump — explicit approval, last resort).

## I. Launch-day landmines

| Item | Status |
|---|---|
| Supabase Auth redirect URLs incl. `https://jriq.in` (keep Pages origin) | ❌ **CHECKED — needs fixing**: Site URL is `http://localhost:3000` and the Redirect URL allow list is **empty** (VERIFIED 2026-10-15). Email+password logins don't use redirects today, but recovery/confirm links would misroute. Launch config (approval-gated): set Site URL to `https://jriq.in`, add `https://jriq.in/*` and `https://shauryaojaswa.github.io/*` to Redirect URLs |
| Cache headers (`index.html` no-cache; hashed assets immutable 1y; keep last 3 asset generations) | ✅ documented in `.htaccess` + runbook; verify at deploy |
| DNS TTL lowered to 300s ≥24h before cutover | ❌ pending (runbook step 1) |
| Timezone | ✅ checked — no daily-cap logic; rate limit timezone-safe |
| Business-day/`current_date` semantics | ✅ N/A (subscription dates only, self-consistent) |

## J. User actions (only unavoidable ones)

1. ~~Supabase dashboard login~~ — **done 2026-10-15** (plan/backup/migration/Auth verified).
   Still needed inside the dashboard: **reset the production DB password** (Settings →
   Database) so `pg_dump` can authenticate — the password is never shared in chat; it can
   be typed once at the `pg_dump` prompt.
2. Approve installing Docker Desktop (for the restore test) — or approve the
   disposable-Supabase-project alternative.
3. One network with DB egress for `pg_dump` (phone hotspot is enough).
4. Approve provisioning the MilesWeb website space ("Start from Blank Website") so
   doc root/SSL/SPA support can be verified (Phase E #1–#8).
5. **Final release approval** (below) — plus a separate yes/no on the §B plan upgrade.

## K. Blockers

- Backup COMPLETED/RESTORE-TESTED: blocked on (2)+(3) above (Docker or disposable
  project; a network with DB egress; DB password reset).
- MilesWeb verification (#7/#8) and `jriq.in` cutover: blocked on (4).
- ~~Plan tier + Auth URLs~~ — verified 2026-10-15 (§A/§B/§I); the Auth URL config change
  itself is part of the approved runbook, not a blocker.

## L. Approval request — the precise action set

Approving means I may execute, **in this order and nothing else**:

1. `scripts/prod-baseline.sql` against production (read-only) → save output outside repo.
2. `pg_dump` of production → `%USERPROFILE%\backups\jriq\` + `pg_restore --list` +
   restore test into a disposable environment, then destroy it (evidence recorded).
3. Read prod `supabase_migrations.schema_migrations`; reconcile with the 7 local files.
4. Apply the 4 migrations in order (SQL editor or `db push`, per reconciliation).
5. Post-migration verification against the baseline (protected claim `GIFT-DDD89040`,
   submission `dsklks`, 8 rewards, 8 tiers, `min_spin_amount` 10000, owner mapping).
6. Smoke: throwaway store create → spin → claim → delete (synthetic data only).
7. Deploy `v1.0.0` root build to MilesWeb once provisioned (assets → `index.html` →
   `.htaccess` last), or first to GitHub Pages (`staging` → `gh-pages`) if MilesWeb
   fails the decision rule.
8. DNS: create the `jriq.in` zone/records at MyDNSVault (TTL 300), point to hosting,
   AutoSSL, external verification matrix, 60-minute observation, TTL restore.

**Not included in any approval:** billing/plan changes (§B needs its own yes),
destructive SQL of any kind, touching production `jwellery` beyond the above, the two
paused projects, or any change to genuine customer data.

### Release checklist (7.1)

- Tag: `v1.0.0` → commit recorded in §E. Migrations: §C table, in order 1→4,
  preconditions = baseline captured + backup restore-tested.
- Backup artefact: `%USERPROFILE%\backups\jriq\jwellery-pre-jriq-<date>.dump` +
  baseline file + restore-test evidence.
- Build artefact: `npm run build:root` output (base `/`) from `v1.0.0`, preflight:root
  green; fallback artefact `npm run build` (base `/gift/`) for Pages.
- Hosting target: MilesWeb Premium (decision rule §F) else GitHub Pages.
- DNS/SSL changes: MyDNSVault zone creation + A/AAAA + www; AutoSSL; TTL 300 → 3600.
- Expected downtime: **≈ zero** — additive DB changes with identical RPC contracts
  (VERIFIED), static asset swap, Pages stays live as fallback.
- Post-release checks: external matrix (resolve, HTTPS chain, `/store/<real-slug>` 200
  on hard refresh, real spin persists claim, admin/vendor login on new origin).
- Success criteria: matrix all-green + zero auth/submission errors in the 60-minute
  window + protected data counts match baseline.
- Rollback: §H.

### Cutover runbook (7.2)

1. ≥24h before: set DNS TTL 300 (in MyDNSVault once the zone exists); wait out old TTL.
2. Backup verified (restore-tested) BEFORE any migration — abort otherwise.
3. Apply migrations in order in a low-traffic window; check for long-running
   transactions first (`pg_stat_activity`).
4. Post-migration read-only verification vs baseline (§L.5).
5. Throwaway smoke store: create → spin → claim → verify → delete.
6. Deploy root build: hashed assets first, favicon, `index.html` LAST, `.htaccess` LAST;
   keep last 3 asset generations. Preflight host assertion must have passed.
7. AutoSSL; verify certificate chain + no mixed content.
8. External matrix: public resolver sees `jriq.in`; HTTPS valid; `/store/<real-slug>`
   200 on hard refresh; a real spin persists a claim; admin login works on the origin.
9. 60-minute observation: auth errors, submission volume, audit log. Rollback triggers:
   SPA fallback broken (deep-link 404) · claim persistence failing · auth redirect
   failure → rollback = repoint DNS to GitHub Pages (never went down; TTL 300 = minutes).
10. After a clean window: restore TTL to 3600+.

## M. Audit-trigger defect fix — root cause, trigger audit, decision record (2026-10-15)

### M.1 The defect (reproduced VERIFIED on production smoke, 2026-10-15)

Every delete of a `stores` row rolled back with:

`insert or update on table "platform_audit_logs" violates foreign key constraint "platform_audit_logs_store_id_fkey"` ... `PL/pgSQL function public.audit_managed_change() line 35`

Consequence: shops could not be deleted at all. One synthetic smoke shop
(`c8831efe-...`, "Smoke Shop <run>") was stranded on production by this defect.

### M.2 Full trigger audit (VERIFIED against migration source, all 7 files)

`platform_audit_logs` columns: `id, actor_id -> auth.users ON DELETE SET NULL,
store_id -> stores ON DELETE SET NULL, action, details jsonb, created_at`.
Exactly two foreign keys (actor_id, store_id). There is no separate
entity-id/target-id column; `details` jsonb is the only metadata field.
All other audited entities (rewards, tiers, plans, policies, gifts,
invitations, memberships, subscriptions) are referenced by name in `action`
only, so they cannot self-conflict.

`audit_managed_change()` is wired to 11 AFTER-row triggers:
stores/rewards/reward_tiers/store_admins/store_subscriptions/subscription_plans/
tier_gift_options/gift_catalog/platform_policies/store_owner_invitations
(insert|update|delete) and submissions (update of collection_status only;
submissions have no delete trigger).

Self-referencing deletion paths (audit INSERT pointing at an entity deleted in
the same statement/transaction):

1. `stores` delete (direct) -> `stores.delete` audit row carries the dying id. OBSERVED FAILURE.
2. Any `stores` delete cascade -> child audit triggers (rewards, reward_tiers,
   store_admins, store_subscriptions, tier_gift_options, store_owner_invitations)
   each emit rows carrying the dying store id. Same violation on every path.
3. Equivalent case on the actor reference: an auth.users self-deletion cascades
   to store_admins and the audit rows would carry the deleted actor id.

NOT affected: ordinary child deletes while the store is alive (valid
references); gift_catalog/platform_policies/subscription_plans deletes (no
store column); submissions deletes (no delete trigger). So the defect is
confined to deletions that remove the referenced store (or actor) within the
same statement/transaction — every audited table shares the defect only
through that one mechanism.

### M.3 Chosen fix (trigger side) — supabase/migrations/20261015192000_audit_delete_ref_fix.sql

In `audit_managed_change()` only: when the computed store/actor reference no
longer exists at insert time (the entity is being deleted in the same
statement/transaction), write NULL into the live FK column and preserve the
identifier in the existing `details` metadata (`deleted_store_id` /
`deleted_actor_id`). The audit row is always inserted and stays durable;
`action`, `created_at`, actor and `changed_fields` are preserved unchanged.
Valid references are untouched, so live-store child deletions keep their
store linkage (staging probe asserts this). No schema objects added or dropped;
historical audit rows untouched. One guard covers all eleven triggers,
including future ones.

Why this one: it is the narrowest change that satisfies every requirement —
audit rows survive, FK columns only hold live values, the deleted entity's id
remains recoverable from existing metadata, and the cascade case (2) and actor
case (3) are handled by the same explicit guard rather than left broken.

### M.4 Rejected alternative: `platform_audit_logs_store_id_fkey DEFERRABLE INITIALLY DEFERRED` — settled by executable experiment (Phase F-1, VERIFIED 2026-10-15)

Semantic reason (standing analysis): the audit row is INSERTED after its parent
is already gone. `ON DELETE SET NULL` is a referential ACTION that only runs
when the parent row is deleted while child rows exist; here the child is
created after the parent delete, so no referential action ever applies to it.
Deferring the check to COMMIT cannot help either — the parent row is still
absent at COMMIT, so the constraint fails at commit instead of at insert.
(Deferral is also not free: it changes check timing for every writer of the
table.) Note the contrast with ordinary delete-order problems — see M.6.

Because a later prompt preferred (b) on the theory that "commit-time checking +
ON DELETE SET NULL lets the audit row survive with NULL store_id", the claim was
settled by experiment rather than argument. A disposable PostgreSQL 17.6
cluster ran the IDENTICAL store-delete scenario in three databases differing
only in function/FK variant (original function extracted verbatim from
`20261010203000_managed_tenant_foundation.sql`; fixed function extracted
verbatim from `20261015192000_audit_delete_ref_fix.sql`). Scenario = seed store
+ 2 rewards + 3 pre-existing audit rows, then a raw `DELETE FROM stores` as
(1) a single autocommit statement — the exact PostgREST pattern — and
(2) an explicit `BEGIN … DELETE … COMMIT`.

| Variant | (1) autocommit statement | (2) explicit transaction | audit row survives with NULL store_id? |
| --- | --- | --- | --- |
| A — original fn + immediate FK (defect reproduction) | ERROR `insert or update on table "platform_audit_logs" violates foreign key constraint "platform_audit_logs_store_id_fkey" … Key (store_id)=(…) is not present in table "stores"` → rollback, store retained | same ERROR → `ROLLBACK`, store retained | no |
| B — original fn + `DEFERRABLE INITIALLY DEFERRED` (the proposed alternative) | statement accepted, **its implicit commit fails with the same FK violation** → rollback, store retained | `DELETE 1` **then `COMMIT` fails with the same FK violation** → `ROLLBACK`, store retained | **no** |
| C — fixed trigger-side fn (M.3, chosen fix) | `DELETE 1`, commits | `DELETE 0` (already gone), commits | **yes** — `stores.delete` row present, `store_id` NULL, `deleted_store_id` recoverable; pre-delete rows durable (FK SET NULL) |

Mechanism fingerprints (VERIFIED from `pg_constraint`/`pg_trigger` on the same
cluster): variant B's FK check triggers really are deferrable
(`tgdeferrable=t, tginitdeferred=t`) but the `ON DELETE SET NULL` action
trigger on `stores` is immediate (`tgdeferrable=f`); and variant B's errors
carry no PL/pgSQL `CONTEXT` line, unlike variant A's
`PL/pgSQL function public.audit_managed_change() line 35` — proof that the
check fired at COMMIT against the queued insert tuple, not at insert time.
`ON DELETE SET NULL` never touches the audit row because it does not exist
while the parent delete runs.

ONE LINE (rejection, citing the experiment): variant (b) is rejected because
Phase F-1 shows it only relocates the failure — `DELETE 1` then `COMMIT` ERROR
then `ROLLBACK`, store retained, audit row lost — while the trigger-side fix
commits the delete and preserves the audit row.

(Also rejected earlier: BEFORE DELETE triggers — changes timing semantics for
all events and leaves cascade paths broken — and per-table special-casing.)

Experiment bench (disposable, temp): `C:\Users\ojaswa\AppData\Local\Temp\jriq-variant\`
(`run.ps1`, `01-base.sql`, `02a/02b-fk-*.sql`, `03-triggers.sql`, `05-scenario.sql`;
function text extracted at runtime from the repo migrations). Exits: initdb 0,
base/fk/fn/triggers 0 × 3 databases, scenario runs 0 (the A/B ERROR lines are
the expected observations), cluster stop 0.

### M.5 Backup readiness (section 7 determination, VERIFIED offline)

The verified restore-tested backup `jwellery-20261015-150511.dump`
(416,184 B, `pg_restore --list` exit 0, 653 TOC entries) contains zero JRIQ
tables (`tier_gift_options`, `gift_catalog`, `platform_policies`,
`store_owner_invitations` absent from the TOC) and predates the four applied
JRIQ migrations, the authorised `CLEAN-0CBBDC9A` claim and the smoke residue.
It is therefore NOT a recovery point for current production state. A NEW
verified `pg_dump` (then `pg_restore --list` verification) is MANDATORY before
the production defect-fix migration, per section 7.

### M.6 Contingency noted, not yet triggered

`reward_tiers` and `submissions` hold composite FKs `(store_id, reward_id) ->
rewards(store_id, id) ON DELETE RESTRICT`. During a raw store delete these can
bind depending on cascade order. Unlike M.4, DEFERRABLE INITIALLY DEFERRED
WOULD fix that case (the referencing rows are deleted within the same
transaction, so a commit-time check passes while integrity is preserved).
If the staging create-delete cycle surfaces this, a second narrowly scoped
migration for exactly those two constraints will be added and re-tested before
production. No change is made speculatively.

### M.7 Execution status at 2026-10-15 19:30 IST

| Step | State |
| --- | --- |
| Root cause + trigger audit | VERIFIED (migration source) |
| Fix-choice experiment (Phase F-1: defect repro + DEFERRABLE variant + trigger-side fix, identical scenario) | VERIFIED — (a) trigger-side stands; (b) rejected with executable proof (M.4) |
| Fix migration authored | DONE (`20261015192000_audit_delete_ref_fix.sql`) |
| Smoke-harness assertion fixes (public-read model, rate_limits schema, normal delete cycle, spec cleanup order — smoke audit rows before store deletion, deletion-event asserted then cleaned, baseline restored) | DONE (scripts/prod-smoke.mjs, `node --check` clean) |
| Staging proof script (two create-operate-delete cycles, 10 conditions) | DONE (scripts/audit-fix-verify.mjs) |
| Production residue cleanup script (normal path, hard-abort semantics) | DONE (scripts/prod-residue-clean.mjs) |
| Staging migration + proof run | PENDING — no DB-port egress from current network |
| Regression suite run (staging-verify.mjs) | PENDING — same |
| New production backup | PENDING — same (pg_dump needs DB port) |
| Production migration + smoke + residue cleanup | PENDING — gated on all of the above |

### M.8 Local simulation evidence (VERIFIED 2026-10-15, PostgreSQL 17.6 throwaway cluster)

The exact migration file was installed on a disposable local cluster with a
mirrored mini-schema (stores/rewards/reward_tiers/submissions/store_admins
with the real composite `ON DELETE RESTRICT` FKs, `platform_audit_logs` with
both real FKs, 4 audit triggers, `auth.uid()` stub). Results:

| Scenario | Result |
| --- | --- |
| Raw `DELETE FROM stores` with pool tier + legacy tier (reward_id set) + submission referencing the reward + membership | `DELETE 1` — succeeds; defect fixed |
| Composite-FK RESTRICT contingency (M.6) | Did NOT materialize even with referencing tier+submission — no second migration needed (staging will re-confirm on the real schema) |
| `stores.delete` audit row | present, store_id NULL, `details->>deleted_store_id` = the store id, changed_fields preserved |
| Cascade audit rows (rewards.delete, 2x reward_tiers.delete, store_admins.delete) | all present, store_id NULL, store id recovered from details |
| Pre-delete audit rows | durable (store_id set null by the FK action, rows kept) |
| Live-store child delete (tier) | audit row KEEPS store_id and actor_id — no over-nulling |
| Actor self-deletion cascade | audit row actor_id NULL, `details->>deleted_actor_id` = actor id |

Command exits: initdb 0, migration file 0, schema 0, scenarios 0. Harnesses
`node --check` clean. Staging + production runs remain required (real schema,
RPCs, PostgREST) and are listed as PENDING in M.7.

Network evidence (VERIFIED 2026-10-15): the Supabase DB hostnames are
currently IPv6-only in public DNS (A = NODATA via Google DoH; AAAA present),
this network has no IPv6, and outbound TCP 5432/6543 is blocked by the
carrier/hotspot (portquiz.net:443 succeeds, :5432 fails — conclusive egress
filtering). HTTPS to the Supabase API works. Remote DB work resumes only on a
network with working PostgreSQL egress (direct IPv6 or the IPv4 Supavisor
pooler `aws-0-ap-northeast-2.pooler.supabase.com`, which resolves on IPv4).
