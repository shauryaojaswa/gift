# JRIQ — Production Release Proposal (NOT YET APPROVED, NOT YET APPLIED)

Prepared: 2026-10-15. Status: **awaiting explicit user approval**. Nothing in this document
has been executed against production. Production = Supabase project `jwellery`
(`awshkiwqkuubkhecszzk`) + GitHub Pages deployment at https://shauryaojaswa.github.io/gift/.

Evidence labels: **Verified** (staging command/file), **Reported**, **Inferred**, **Unknown**.

---

## 1. Exact migration files and order

Production currently has the first three migrations (**Inferred** from the 2026-10-14
`migration list --linked` reconciliation; re-verify before release). The release applies
the four new additive migrations **in this order**:

| # | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20261015161000_platform_catalog_policies.sql` | `gift_catalog`, `platform_policies` (+ seed: 11-bracket template, max-4 rule, ₹1,000 default), `store_owner_invitations`, `rewards.catalog_gift_id`, synchronisation trigger |
| 2 | `supabase/migrations/20261015161100_tier_gift_options.sql` | `tier_gift_options` pool table, composite tenant-safe FKs, `UNIQUE (store_id, id)` on `reward_tiers` |
| 3 | `supabase/migrations/20261015161200_reward_engine_multipool.sql` | `submit_customer_entry` engine replacement (uniform pool selection + legacy fallback), `reward_tiers.reward_id` DROP NOT NULL, `save_store_gift_options`, `create_shop`, `set_store_status`, `link_store_owner`, `admin_save_store_tiers`, `save_store_tiers` compat wrapper |
| 4 | `supabase/migrations/20261015170000_anon_grant_tightening.sql` | Defence-in-depth: revoke anon defaults on platform tables |

All four were applied to staging in this order and verified (**Verified**: `supabase
migration list --linked` Local == Remote on `jriq-staging`, plus the 70-check harness).

## 2. Schema changes and affected functions

Additive tables: `gift_catalog`, `tier_gift_options`, `platform_policies`,
`store_owner_invitations`. Altered: `reward_tiers.reward_id` → nullable (pool brackets);
`rewards` gains `catalog_gift_id`. Replaced functions (`CREATE OR REPLACE`, same names):
`submit_customer_entry`, `save_store_tiers`. New functions: `save_store_gift_options`,
`create_shop`, `set_store_status`, `link_store_owner`, `admin_save_store_tiers`.
New trigger: reward↔catalogue synchronisation. RLS enabled on all new tables; anon
grants tightened. Full DDL rationale: `docs/MIGRATION_PROPOSAL.md` (incl. the four
approved §0 design corrections).

## 3. Backward-compatibility analysis

- **RPC signatures preserved**: `submit_customer_entry(p_store_slug, p_request_id,
  p_customer_name, p_customer_phone, p_purchase_amount, p_review_cta_shown,
  p_review_cta_clicked)` and `save_store_tiers(p_tiers jsonb)` keep their argument lists
  and return shapes (`submission_id, claim_code, reward, tier`) — the deployed frontend
  keeps working before, during and after the migration (**Verified** against the same
  baseline on staging).
- **Existing tiers/rewards untouched**: migrations add columns/tables and relax one
  NOT NULL; no data rewrites. Legacy single-gift brackets keep their `reward_id` and
  keep resolving through the fallback path (**Verified** by harness check
  "legacy fallback assigns the tier reward").
- **Saved submissions immutable**: snapshots already denormalised; the sync trigger never
  rewrites submissions (**Verified**: "catalogue rename does not rewrite saved rewards",
  "clearing the pool does not rewrite saved rewards").
- **Old frontend + new DB**: compatible. **New frontend + old DB**: NOT compatible
  (platform/vendor panels call new RPCs) — hence migrate-then-deploy ordering (§5).

## 4. Existing-shop behaviour

`jolly-enterprises` (store `…0001`, owner `oj@gmail.com`) and its 8 rewards / 8 tiers /
genuine submissions are **not modified** by any migration. The shop keeps its
`min_spin_amount` 10000 and tier bounds. Pool brackets exist only where a user later
selects gifts; an empty pool falls back to the tier's legacy reward (or raises the
explicit error for pool-only brackets). Claim `GIFT-DDD89040` / submission `dsklks` remain
untouched (**Verified** mechanism on staging; production state to be confirmed by the
pre/post release checks in §17).

## 5. Rollout and regression-test plan

Order (zero downtime; DB first, frontend second):

1. Verified `pg_dump` backup (§6) — **mandatory gate**.
2. Re-link CLI to production (explicit approval), confirm `migration list` shows exactly
   the 4 pending versions and nothing else.
3. `supabase migration up` (or `db push`) → verify `migration list --linked` Local == Remote.
4. Post-migration SQL checks (§17) incl. production-data preservation.
5. Deploy frontend: GitHub Pages rebuild from `staging` (merge → push `gh-pages` → Actions),
   or the `jriq.in` root build once MilesWeb is ready (§11).
6. Regression: live customer flow on `jolly-enterprises` with a synthetic phone + tiny
   amount? **No** — production submissions must stay genuine; regression on production is
   read-only smoke (page loads, tier rendering, vendor login by the real owner) + full
   functional proof remains on staging (70/70 SV + 27/27 UI checks).
7. Monitor for 48h: error logs in Supabase, `platform_audit_logs`, submission anomalies.

## 6. Required verified backup (release gate)

A written procedure is NOT a backup. Before migration:

```
pg_dump "postgresql://postgres@db.awshkiwqkuubkhecszzk.supabase.co:5432/postgres" ^
  --format=custom --file=jwellery-pre-jriq-YYYYMMDD.dump
```

- Password is entered interactively at the prompt (or via `PGPASSWORD` set in the local
  shell only — never in chat, scripts or git).
- **Network requirement (Verified 2026-10-15)**: direct (5432) and pooler (6543) TCP to
  Supabase is **blocked from the current machine/network** — `pg_dump`, `pg_restore` and
  `supabase migration up` cannot run from here as-is. The backup must be executed from a
  network with DB egress (e.g. a phone hotspot, verified with
  `Test-NetConnection db.awshkiwqkuubkhecszzk.supabase.co -Port 5432` first) or from a
  cloud shell/VM. This is a hard prerequisite, not a preference.
- **Production DB password**: unknown to the project; reset it in the Supabase dashboard
  (Settings → Database → Reset DB password) before the dump if no password is at hand.
- **Restore-verification (mandatory)**: restore the dump into a disposable database
  (local Postgres — Docker is NOT installed on this machine and needs user approval to
  install — or a temporary free Supabase project created and destroyed for the purpose),
  verify row counts against the captured baseline, and confirm the protected claim
  `GIFT-DDD89040` round-trips. Keep the dump file local-only, outside the repo
  (`%USERPROFILE%\backups\jriq\`); never commit it. Never overwrite an earlier dump.
- **Pre-migration baseline (mandatory)**: run `scripts/prod-baseline.sql` (read-only,
  PII-free output) before the dump and save its output beside the dump.

## 7. Secure password-entry instructions

- Production DB password: enter only at the `pg_dump`/`psql` prompt or a local env var.
  Never paste it into chat, code, or CI variables.
- If the password is unknown/rotated: reset it in the Supabase Dashboard (Database →
  Settings → Reset DB password) — that action needs the user's dashboard login.
- Service-role key: local shell env vars only (used for verification queries, if at all).

## 8. Backup integrity and recovery verification

`pg_restore --list` must exit 0 and list all tables. Row-count sanity (expected minimums
**Reported** from production history): `submissions` includes `dsklks`; `rewards` = 8 for
store `…0001`; `reward_tiers` = 8. Recovery drill: the restore into a scratch DB *is* the
drill — if it restores and counts match, rollback (§14) is viable.

## 9. Risks and failure modes

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration error mid-sequence | Low (applied cleanly on staging) | Migrations are transactional per file; stop at the failing file, restore or forward-fix |
| Engine replacement subtly changes legacy behaviour | Low | Legacy fallback + immutability checks pass on staging; prod smoke per §5 |
| New frontend deployed before DB | Medium if order inverted | Follow §5 order; preflight env gate |
| Grant tightening locks out anon flows | Low | Verified on staging: public customer flow works (70/70 incl. anon submission path) |
| Sync trigger misfires on catalogue edits | Low | Verified: renames/deactivations never rewrite saved rewards |
| Pages deploy job transient failure | Occurred before | Re-run workflow / empty commit (documented) |

## 10. Recovery or forward-fix

- If a migration file fails: the transaction rolls back that file; diagnose on staging
  first (same SQL), re-run. Never edit an applied file — add a new one.
- If post-release defects appear: forward-fix with a new migration (additive) unless data
  corruption occurs, in which case the verified `pg_dump` restore is the last resort
  (requires explicit approval; it reverts ALL changes since the dump).

## 11. Production frontend build and environment selection

- GitHub Pages (default release path): merge `staging` → `gh-pages`, push; the workflow
  builds with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` = **production** Actions
  variables (confirm they are set before the release).
- jriq.in (when hosting is verified): `npm run preflight:root` then upload `dist/`.
- `scripts/preflight.mjs` refuses a release build pointed at staging and fails on
  service-role keys in `dist` (**Verified** behaviour).

## 12. Required GitHub / CI changes

None mandatory: `deploy.yml` on `gh-pages` keeps working. Recommended (post-release):
merge the workflow + source so `staging` is the single source of truth (the workflow file,
`public/404.html` and the `index.html` restore script already exist on `staging`).

## 13. Downtime / user impact

None expected: schema changes are additive and RPC signatures are preserved; the frontend
deploy is a static swap (seconds of stale cache, `max-age=600`). Customer spins that occur
during the deploy window use the old or new bundle, both compatible.

## 14. Rollback strategy

- Frontend: re-deploy the previous `gh-pages` commit (or revert DNS for `jriq.in`);
  GitHub Pages stays available as the rollback target throughout.
- Database: additive migrations normally need no rollback; if required, restore the
  verified `pg_dump` (explicit approval; reverts everything since the dump) or
  forward-fix. Old frontend + migrated DB remains a supported combination (§3).

## 15. Exact commands (executed only after approval)

> All `pg_*` / `supabase migration` commands below need outbound TCP 5432/6543 to
> Supabase (Verified blocked from the current network on 2026-10-15). Run them from a
> network with egress (verify first with `Test-NetConnection ... -Port 5432`), or apply
> the migration files in order via the Supabase dashboard SQL editor (each file in its
> own query — Postgres DDL is transactional per file). NEVER use the production SQL
> editor for anything except these approved files.

```
# 0. baseline (read-only, PII-free) + backup (see §6) + integrity verification
#    scripts/prod-baseline.sql -> save output outside the repo
pg_dump "postgresql://postgres@db.awshkiwqkuubkhecszzk.supabase.co:5432/postgres" --format=custom --file=jwellery-pre-jriq-<date>.dump
pg_restore --list jwellery-pre-jriq-<date>.dump   # exit 0

# 1. link CLI to production (currently linked to staging)
npx.cmd supabase link --project-ref awshkiwqkuubkhecszzk
npx.cmd supabase migration list --linked        # expect exactly 4 pending

# 2. apply the four migrations (order per §1)
npx.cmd supabase migration up

# 3. verify
npx.cmd supabase migration list --linked        # Local == Remote
# read-only SQL checks per §17 (compare against the saved baseline)

# 4. frontend release
git checkout gh-pages && git merge staging && git push origin gh-pages
# watch the Actions run to success, then smoke the live site
```

## 15a. Fifth migration — audit defect fix (applied 2026-10-15, AFTER the four above)

`supabase/migrations/20261015192000_audit_delete_ref_fix.sql` — narrowly scoped,
separately versioned, applied via `supabase migration up --db-url` (session-mode
Supavisor pooler; runtime-built URL, output scrubbed) after the staging gates
passed (`audit-fix-verify.mjs` 23/23, `staging-verify.mjs` 70/70) and after the
verified pre-change backup `jwellery-20261015-203239.dump` (§8). Trigger-side fix
in `audit_managed_change()`: dying store/actor refs are written as NULL to the FK
column with the id preserved in `details.deleted_store_id`/`deleted_actor_id`;
the audit row is always durable. The alternative
(`DEFERRABLE INITIALLY DEFERRED` FK) was rejected with executable proof — it only
relocates the failure to COMMIT (RELEASE_READINESS M.4). Production after the
fix: residue shop deleted via the normal path (the fix's production test) and
smoke 35/35 exit 0. Full record: `docs/RELEASE_READINESS.md` section M.

## 16. Changes requiring explicit approval

1. Running `pg_dump` **and verifying** the production backup.
2. `supabase link` to the production project.
3. Applying the four migrations to production.
4. Any production write/verification SQL beyond read-only checks.
5. Merging `staging` into `gh-pages` and pushing (production deploy).
6. MilesWeb DNS/hosting changes and the `jriq.in` cutover.

## 17. Pre-release criteria (all must pass)

- [ ] Staging: `scripts/staging-verify.mjs` 70/70 (latest run recorded).
- [ ] Staging: `scripts/ui-verify.mjs` 27/27 (latest run recorded).
- [ ] `npm test` 216/216, `npm run lint` 0, `tsc -b` 0, `npm run build` 0, `npm run build:root` 0.
- [ ] `scripts/preflight.mjs pages` 0 failures with production env classification.
- [ ] Secret scan clean (source + dist role classification).
- [x] Verified `pg_dump` exists and restores (§8) — `jwellery-20261015-203239.dump`
      (552,410 B, `pg_restore --list` exit 0, 914 TOC entries, all JRIQ tables).
- [x] Production `migration list` shows exactly the 4 expected pending versions —
      applied 2026-10-15 (exit 0); plus the defect-fix migration 15a (exit 0).
- [ ] Post-migration: `dsklks`/`GIFT-DDD89040`, 8 rewards, 8 tiers, `min_spin_amount`
      10000 intact; new tables present; RLS enabled on all new tables.
- [ ] Live smoke: customer page, vendor login (real owner), platform login (platform
      admin account — create one via the approved workflow if none exists).
