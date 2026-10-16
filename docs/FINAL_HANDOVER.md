# JRIQ — Final Handover

Prepared: 2026-10-15. Companion docs: `PROJECT_STATUS.md` (state), `DEPLOYMENT.md`
(build/ship), `PRODUCTION_RELEASE_PROPOSAL.md` (production release gate),
`REQUIREMENTS_TRACEABILITY.md` (requirement → evidence), `MIGRATION_PROPOSAL.md` (schema design).

## 1. What JRIQ is

Multi-tenant white-label jewellery rewards SaaS. One React SPA + one Supabase project
serve many shops. Platform admin provisions shops and the gift catalogue; owners pick up
to 4 gifts per purchase bracket; customers spin and the **backend** assigns one gift with
equal probability, persisted immutably before the wheel animates, then a claim code.

## 2. Repository map

| Path | Purpose |
|---|---|
| `src/features/home/Home.tsx` | JRIQ landing (`/`) |
| `src/features/platform/` | Platform admin (`/platform/login`, `/platform/shops`, `/platform/catalog`) incl. `GiftPoolPanel.tsx`, `api.ts` |
| `src/features/customer-flow/` | Customer journey (`/store/:slug`) — details → review → wheel → reward → thank-you |
| `src/features/vendor/` | Owner workspace (`/vendor/*`) incl. per-bracket gift panel on Rewards |
| `src/lib/reward-engine.ts` | Presentation-side tier mapping + wheel segments (display only) |
| `src/lib/data/supabase.ts` | Data provider + RPC contracts + jsonb assignment parsing |
| `supabase/migrations/` | 7 migrations (3 legacy + 4 JRIQ) — additive only, never rewritten |
| `scripts/staging-verify.mjs` | 70-check staging integration harness (engine, tenancy, authz) |
| `scripts/ui-verify.mjs` | Playwright UI harness (platform/vendor/customer flows) |
| `scripts/preflight.mjs` | Release gate per build target |
| `src/lib/database.types.ts` | Generated from the real staging schema |

## 3. Environments

- **Production** Supabase `jwellery` (`awshkiwqkuubkhecszzk`) + GitHub Pages
  (`shauryaojaswa.github.io/gift`). Protected data: submission `dsklks` → claim
  `GIFT-DDD89040`, owner `oj@gmail.com`, store `jolly-enterprises`.
- **Staging** Supabase `jriq-staging` (`wpytaorgiqkfnifsuhax`) — synthetic data only.
  DB password: `%USERPROFILE%\.supabase\jriq-staging.db-password.txt` (user-only ACL).
  API keys: fetched per session via `npx.cmd supabase projects api-keys --project-ref
  wpytaorgiqkfnifsuhax --output json` — never printed or committed.
- Paused projects `checkpoint`, `shauryaojaswa's Project` — never touch.

## 4. Daily commands

```
npm run dev              # local dev (serves at /)
npm test                 # 213 unit/component tests
npm run lint             # oxlint
npx tsc -b               # type check
npm run build            # GitHub Pages build (base /gift/)
npm run build:root       # jriq.in build (base /)
npm run preflight        # full release gate (pages)
npm run preflight:root   # full release gate (root)
```

Staging harnesses (need the 3 staging env vars; see the header comment in each script):

```
node scripts/staging-verify.mjs   # 70 DB/engine/tenancy checks (self-cleaning)
node scripts/ui-verify.mjs        # UI flows incl. Create Shop UI + customer spin
```

## 5. Things future-you must know

1. **Reward selection is server-side.** The wheel never decides anything; it renders the
   saved assignment (`buildSegments(config, assigned)` overrides the assigned segment).
2. **Pool brackets vs legacy brackets.** `reward_tiers.reward_id` nullable = pool bracket
   (`tier_gift_options` links materialised `rewards` rows carrying `catalog_gift_id`).
   Non-null = legacy single gift. Empty pool + no legacy gift = explicit error, never a
   silent prize.
3. **Immutability.** `submissions` store a full reward snapshot; catalogue/selection edits
   never rewrite saved rewards. `request_id` idempotency: identical retry replays, reuse
   with a different payload is rejected. Collection is single-shot.
4. **Onboarding semantics.** New shops start `onboarding` (public flow closed). Platform
   admin can configure; owners can only after activation (`is_store_admin` requires an
   active campaign).
5. **Tenancy.** Composite FKs keep `(store_id, reward_id)` pairs consistent; RLS on every
   table; pools are invisible to anon; platform RPCs check `is_platform_admin()` and reject
   owners (all covered by negative tests).
6. **Never rewrite migration history.** Fix forward with a new migration file.
7. **Build targets are config-free.** `vite.config.ts` picks the base from the build mode;
   don't hand-edit it. Router basename follows `BASE_URL`, so QR links work on both.
8. **Windows tooling.** `npm.cmd`/`npx.cmd` only; `git push` writes to stderr (verify refs
   instead of trusting exit codes); PowerShell 5.1 lacks `utf8NoBOM` (use git to extract
   files byte-exact).

## 6. Release process (summary)

Staging is the release branch for now. Production release = verified `pg_dump` → additive
migrations via `supabase migration up --db-url` → frontend deploy (MilesWeb upload for the
root build; Pages merge for the `/gift/` build) → smoke. Since **2026-10-16 `jriq.in`
(MilesWeb) is PRIMARY** and GitHub Pages `/gift/` is the honored fallback, kept live.
Adding a shop = platform admin UI action — **no deploy, no DNS**.

## 7. Production data state (pre-cutover reference, 2026-10-15 VERIFIED)

Counts captured before the jriq.in cutover; the watch window compares against these
(full table in `docs/CUTOVER_CHECKLIST.md` §0): stores 1, submissions 2,
`platform_audit_logs` 28 (27 baseline + the kept residue-deletion event
`fbbbe474-…`, per `RELEASE_READINESS.md` M.9), reward_tiers 8, rewards 8,
store_admins 1, platform_admins **0**, protected claims 2 (`GIFT-DDD89040`,
`CLEAN-0CBBDC9A`, both `awaiting`), `schema_migrations` 8 (the audit-delete-ref fix
migration `20261015192000_audit_delete_ref_fix.sql` is applied).

Defect/fix/experiment record: `docs/RELEASE_READINESS.md` M.4 (DEFERRABLE experiment —
rejected variant B with proof), M.7 (status), M.9 (production evidence). Smoke:
`scripts/prod-smoke.mjs` 35/35; harnesses `scripts/audit-fix-verify.mjs` (23/23) and
`scripts/staging-verify.mjs` (70/70) are re-runnable evidence producers.

## 8. Backups & keep-alive (free tier)

- **Weekly `pg_dump` of production, keep last 4**, every Sunday. Verify each dump with
  `pg_restore --list` (exit 0) before retiring an older one. Store outside the repo:
  `C:\Users\ojaswa\backups\jriq\` (e.g. `jwellery-YYYYMMDD-HHMMSS.dump` — the verified
  pre-change dump `jwellery-20261015-203239.dump` is the current reference). Never
  overwrite an old dump; only rotate beyond 4. Passwords: `%USERPROFILE%\.supabase\*.db-password.txt`.
- **Pro upgrade revisit: after first revenue**, with a dated backstop of **2026-11-15** —
  free-tier limits (project pausing, egress, daily backups) become a risk once real
  customer traffic is continuous; revisit then, earlier at first revenue, or if
  submissions grow materially.
- **Keep-alive**: `node scripts/keepalive.mjs` (one authenticated read-only query) —
  use **only if there has been no organic traffic for ~5 days** to prevent free-tier
  project pausing. Env: `SUPABASE_URL` (production) + anon/service key, injected at
  runtime, never committed.

## 9. platform_admins — bootstrap record & instructions

**Bootstrapped 2026-10-15 20:20 UTC** — `platform_admins` holds exactly one row: user
`631881cb-a92f-4087-a788-d5a9bb1dbf1b` (the owner's account), inserted by the owner via
the Table Editor under the approved bootstrap exception. VERIFIED 2026-10-16 at API level
(sign-in 200 + JWT; `is_platform_admin()` resolves true; shop-list surface returns exactly
`jolly-enterprises`, zero cross-tenant rows). To bootstrap an additional admin (2 minutes):

1. Sign in to the Supabase dashboard → project `awshkiwqkuubkhecszzk` → Authentication →
   Users → find (or invite) the admin's user → copy its `auth.uid` (UUID).
2. SQL editor is **not** used for JRIQ changes. Use the Table Editor on
   `platform_admins` → Insert row → `user_id` = that UUID. (This single insert is the
   approved bootstrap exception; all other DB changes go through migrations.)
3. Verify: `https://jriq.in/platform/login` signs in and shows the shops dashboard.
   Record who was bootstrapped and when in this section.

Platform flows are additionally exercised by the approved harnesses (`scripts/prod-smoke.mjs`,
`scripts/postlaunch-smoke.mjs`).

## 10. Evidence locations

| Evidence | Where |
|---|---|
| Fix experiment + release evidence | `docs/RELEASE_READINESS.md` M.4/M.7/M.9 |
| Cutover checklist + pre-cutover counts | `docs/CUTOVER_CHECKLIST.md` |
| Rollback steps | `docs/ROLLBACK.md` |
| Hosting facts + DNS sheet | `docs/DEPLOYMENT.md` §5 |
| Watch logs | `logs/cutover-watch-*.log` (gitignored) |
| Backups | `C:\Users\ojaswa\backups\jriq\` |
| Upload staging + SHA256s | `C:\Users\ojaswa\AppData\Local\Temp\opencode\jriq-deploy\` |
| Harness scripts | `scripts/prod-smoke.mjs`, `audit-fix-verify.mjs`, `staging-verify.mjs`, `postlaunch-smoke.mjs`, `cutover-watch.mjs`, `keepalive.mjs` |

## 11. Launch record (2026-10-16)

**Declaration — 2026-10-16, 08:38 IST (03:08 UTC): `jriq.in` is live and verified.**

| Item | Record |
|---|---|
| Cutover matrix | 6/6 VERIFIED (site loads, hard-refresh deep link, spin-persistence 15/15 w/ zero audit delta, vendor scoping, platform login API-level, Pages `/gift/` warm) |
| 60-min watch | 2026-10-15 20:06 → 21:04 UTC — 30/30 rounds, **120/120 checks PASS, zero blips**, no pre-authorised trigger fired. Log: `logs/cutover-watch-2026-10-15T20-06-02-619Z.log` (gitignored) |
| TTL | **300 retained deliberately** — (a) browser automation worked but no authenticated MyDNSVault/mPanel session existed; (b) no DNS API/credentials in-environment. Safer 5-min rollback propagation while young. **Revisit: >1000 daily visitors or 90 days stable, whichever first.** Click-path (1 min): MyDNSVault → zone `jriq.in` → A record `@` (`45.199.139.29`) → TTL 300 → 3600 → Save |
| Bootstrap | `platform_admins` row `631881cb-a92f-4087-a788-d5a9bb1dbf1b`, 2026-10-15 20:20 UTC, owner via Table Editor (approved exception) — §9 |
| Backups | Weekly `pg_dump` keep-last-4, Sundays; baseline `jwellery-20261015-203239.dump` (verified) — §8 |
| Revisit-Pro | After first revenue (backstop 2026-11-15) — §8 |

**Deviations & corrections (honest record):**

1. **Test-credential set via Auth Admin API** (not the dashboard recovery email — the
   account's inbox is a non-routed test address). The owner test password
   (`oj@gmail.com`) was generated programmatically and written only to
   `%USERPROFILE%\.jriq-test-login.txt`; it never appeared in chat, logs, or the repo.
   **Rotate it at your convenience** — it is a known-rotation credential.
2. **Assertion bug (mine, not the system's)**: one verification compared the store's
   `name` ("CUSTOMER REWARDS") against `jolly-enterprises`, which is the store's **slug**.
   Read-only query proved the data correct; the row re-verified cleanly.
3. **mPanel upload quirk**: subdirectory uploads silently vanish unless the folder exists
   first; folder creation is a separate POST (`item_type=folder`). Also: the edge closes
   connections on `Expect: 100-continue` — the uploader disables it.
4. **Rotation required — Supabase dashboard password**: the dashboard account password was
   pasted into a chat thread during the v1.1.0 work (2026-10-16). It was never echoed,
   stored, used, or committed here (source secret scan clean), but any credential that has
   been typed into a chat must be treated as exposed: **rotate the Supabase dashboard
   password** (and confirm the GitHub and MilesWeb passwords are not reused elsewhere).
   This item is recorded as a task only — never the value.
5. **v1.1.0 backup deviation (honest record)**: the usual pre-deploy `pg_dump` could not
   run — pooler TCP 5432/6543 egress is blocked from the build machine (consistent
   timeouts; the 0-byte dump it produced was deleted, not trusted). Fallback taken:
   a full logical JSON export of every public table via the Supabase Management API
   (`backups/jwellery-20261016-124338.logical.json`, 95 KB, 14 tables, row counts match
   the known state). Both v1.1.0 migrations are additive and data-free, so the rollback
   surface was the SQL itself (documented per migration header), not data. **Take a real
   `pg_dump` as soon as you are on a network with egress to the pooler** (the weekly
   keep-last-4 rule then resumes from that dump).
6. **deploy-verify.ps1 TLS row fixed**: the original row grepped curl for the OpenSSL
   phrase `SSL certificate verify ok`, which Windows' schannel-backed curl never prints —
   a false negative. The row now validates the X509 chain through .NET (throws
   `TrustFailure` on an untrusted chain) and prints cert expiry; also no longer hardcodes
   a bundle hash (it derives it from `dist/index.html`).

**Open item: none — v1.1.0 shipped 2026-10-16.** The URL restructure — root-level shop
slugs `/{slug}`, per-shop `/{slug}/admin`, lossless `/store/:slug` redirect, reserved-slug
wall (router + DB) and the JRIQ homepage — is **live on `jriq.in`** as tag
`v1.1.0 -> 7cbe8d6`. Gates pre-deploy: unit 273/273, staging-verify 70/70, slug-swap
72/72, prod-smoke pattern 28/28, URL acceptance 72/72 on both builds, preflight 11/11 +
12/12. Post-deploy: deploy-verify 10/10, production smoke 35/35, live legacy-QR redirect
proof. Record and rollback: `docs/V1.1.0_RELEASE_PROPOSAL.md` §7-8.
