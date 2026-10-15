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
| COMPLETED | ❌ **NOT DONE** — requires your data-handling approval, the production DB password (dashboard reset if unknown), and a network with DB egress |
| RESTORE-TESTED | ❌ **NOT DONE** — also needs Docker Desktop (not installed; needs your approval to install) or a disposable Supabase project |

**Hard blocker (VERIFIED):** this machine's network blocks Supabase DB ports (5432 and
6543 both time out; staging and production alike). `pg_dump`, `pg_restore` and
`supabase migration up` are impossible from here as-is. Options: (1) run from a phone
hotspot / other network — verify with `Test-NetConnection db.awshkiwqkuubkhecszzk.supabase.co -Port 5432`;
(2) a cloud VM/shell; (3) dashboard SQL editor for the migrations (files are
transactional each). Until a restore test passes, "backup verified" reads **UNVERIFIED**.

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
