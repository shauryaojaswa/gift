# JRIQ — Project Status

Last reconciled: 2026-10-15 (against actual repository, migrations, staging project and
authenticated CLI output).
Evidence labels: **Verified** (command/file/authenticated response), **Reported** (user/audit),
**Inferred**, **Unknown**.

## 1. Purpose and architecture

JRIQ is a multi-tenant jewellery rewards SaaS. One shared React SPA + one Supabase project
serve many independently configured shops (tenants). The platform administrator provisions
shops, maintains the central gift catalogue and platform policies; shop owners manage their
own shop's per-bracket gift selections; customers spin to reveal a **server-assigned** gift
and receive a claim code.

Customer journey (working, live in production): branded landing → details form (₹ INR) →
"SHARE YOUR EXPERIENCE" review invitation (optional) → 12-card Google Review Assistant modal →
"WELCOME BACK!" → wheel reveal (lands on the saved backend reward) → reward + claim code →
"THANK YOU!" screen.

## 2. Verified environment state (2026-10-15)

| Item | State | Evidence |
|---|---|---|
| Repo `C:\Users\ojaswa\Desktop\gift` | branch `staging` @ `27aad4c` + staging implementation worktree (this release) | git (Verified) |
| `main` | `cfa06e0` (untouched) | git (Verified) |
| `gh-pages` | `4b0f17a` (untouched) | git (Verified) |
| Worktrees | main repo (`staging`), `gh-pages-live` (`gh-pages`), stale `deploy-main` (untouched) | git worktree list (Verified) |
| Public site | https://shauryaojaswa.github.io/gift/ (rollback target) | HTTP (Verified) |
| Unit tests | **213/213 passing** (17 files: 161 pre-existing + 52 new) | `npm test` (Verified 2026-10-15) |
| Lint (oxlint) | exit 0 (warnings only, same idiom as pre-existing files) | `npm run lint` (Verified) |
| TypeScript | `tsc -b` exit 0 | (Verified 2026-10-15) |
| Production build | exit 0 for both targets (`/gift/` and `/`) | `npm run build`, `npm run build:root` (Verified) |
| Preflight gates | pages target 10/10, root target — see §9 | `scripts/preflight.mjs` (Verified) |
| Staging validation | **70/70 checks, twice consecutively** (hermetic) | `scripts/staging-verify.mjs` (Verified 2026-10-15) |
| Secret scan | clean — 0 credential hits in source; dist holds no inlined keys in demo builds; service-role keys never in frontend | scans (Verified) |
| Supabase CLI | v2.121.0 via `npx.cmd` (PowerShell: never `npx.ps1`), authenticated | (Verified) |

### Supabase projects

| Name | Reference | Status | Treatment |
|---|---|---|---|
| `jwellery` (production) | `awshkiwqkuubkhecszzk` (`ap-northeast-2`) | ACTIVE_HEALTHY | Preserve; no writes without approval |

- **Plan/billing (2026-10-15)**: `jwellery` is on the **Free** plan (org plan Free, project
  shown as "NANO"). Pro upgrade ($25/mo) reached the "Confirm upgrade" step but was
  **HELD by the user** — no billing change made. Free-plan risks stand: no project
  backups, no PITR, auto-pause after ~7 idle days. Pre-migration baseline captured
  (read-only, PII-free) — see `docs/RELEASE_READINESS.md` §Baseline 2026-10-15.
- **Backup (2026-10-15)**: verified `pg_dump` of production COMPLETED to the local-only
  folder `%USERPROFILE%\backups\jriq\` (416 KB data dump + 297 KB DDL snapshot, both
  exit 0; `pg_restore --list` parses cleanly, 653 TOC entries). Production DB password
  rotated into a session file (never in chat). Because the plan is Free, weekly manual
  dumps (keep last 4, verify each) are the sole recovery path — and production needs a
  weekly keep-alive touch to avoid auto-pause.
- **Restore test (2026-10-15) — CLEAN**: the dump restored into a disposable local
  UTF-8 PostgreSQL 17.11 cluster with `pg_restore` exit 0 / 0 errors (only the 4
  Supabase-Vault platform TOC entries excluded — Supabase-only extension). Item-by-item
  diff vs the baseline matched everything: 26 table counts, `GIFT-DDD89040` byte-identical,
  shop 8/8/10000, 3 migration rows, owner mapping. Disposable cluster destroyed with
  verification afterwards (dir deleted, port closed, no processes left). Full evidence:
  `docs/RELEASE_READINESS.md` §Restore test 2026-10-15. **Restore gate CLOSED CLEAN —
  migration and cutover phases authorised.**
| `checkpoint` | `essinjjyghevfylkfzwi` | INACTIVE (paused) | Never repurpose/reset |
| `shauryaojaswa's Project` | `nighrprmeewtxitlqela` | INACTIVE (paused) | Never repurpose/reset |
| `jriq-staging` | `wpytaorgiqkfnifsuhax` (org `ecqymsoxaiyoawdmimds`, `ap-northeast-2`) | ACTIVE_HEALTHY | Staging target; free tier (2 active projects); synthetic data only |

Local Supabase link currently points at **staging** (`supabase/.temp/project-ref`, gitignored).
Any production DB operation requires an explicit re-link and approval.

### Domain and hosting

- `jriq.in` (five separate facts, Verified 2026-10-15):
  - **Registration**: Active, registered 2026-10-14, expires **14 October 2027**; registrar
    of record = Hosting Concepts B.V. dba **Openprovider** (IANA 1647) — sold via MilesWeb
    (REPORTED by user; RDAP corroborates a reseller path). Domain id 74851 in the MilesWeb
    client area.
  - **DNS**: delegation **is** configured — `luna/odin/neon.mydnsvault.com` (VERIFIED via
    RDAP; corrects the earlier "nameservers unconfigured" note). Resolution fails with
    SERVFAIL because the DNS **zone at MyDNSVault was never created**. Fix = create the
    zone + records in MilesWeb DNS (not a nameserver change).
  - **Hosting**: MilesWeb "Premium" shared plan, Active, bound to `jriq.in`, due 2027-10-14
    (25 GB NVMe, unmetered bandwidth, daily backups, free SSL per site — REPORTED from
    MilesWeb public specs). **No website space provisioned yet** — mPanel only offers the
    "add website" wizard (provisioning = deployment action, approval required).
  - **SSL**: not issued yet (free SSL included in plan) — UNKNOWN until provisioning.
  - **Live deployment**: not live; GitHub Pages (base `/gift/`) is the live app and rollback.
  - DB egress from the current network to Supabase (5432/6543) is **blocked** (VERIFIED) —
    `pg_dump`/`pg_restore`/`supabase migration up` need another network or the SQL editor.
- GitHub Pages deploy: Actions workflow on the `gh-pages` branch (`deploy.yml`), builds with
  repo `VITE_*` Actions variables, `base: '/gift/'`, SPA deep-link restore via `public/404.html`
  + the `?p=` restore script in `index.html` (both now present on `staging` too).
- GitHub Pages deploy: Actions workflow on the `gh-pages` branch (`deploy.yml`), builds with
  repo `VITE_*` Actions variables, `base: '/gift/'`, SPA deep-link restore via `public/404.html`
  + the `?p=` restore script in `index.html` (both now present on `staging` too).

## 3. Technology stack (Verified: package.json)

React 19.2.8 · React Router 7.18.4 · Vite 8 · Tailwind CSS 3.4 · Zustand 4.5.7 ·
TypeScript 5.8 · Supabase JS 2.x · date-fns · qrcode (QR generation) ·
@testing-library + vitest 5 (tests). Package manager: npm (`package-lock.json`).
No framework migrations — stack stays as-is.

Build targets (no config editing required):

- `npm run build` → GitHub Pages build, base `/gift/`
- `npm run build:root` → jriq.in build, base `/`
- `npm run preflight` / `npm run preflight:root` → full release gate per target
  (deps, lint, tests, TypeScript, build, environment classification, secret scan,
  base path, SPA fallback artifacts — never prints secret values)

## 4. Database

> Naming note (Verified 2026-10-15): the claim code is persisted in the SQL column
> `submissions.coupon_code`; "claim code" is the product/UI term and `claim_code` is
> the OUT parameter name of `submit_customer_entry` (same value). `rewards.claim_code_prefix`
> is a separate real column holding the prefix (e.g. `GIFT`).

Migration history (7 migrations; additive only; never rewritten). Local == Remote on
staging (Verified `supabase migration list --linked`, 2026-10-15):

1. `20261010202900_initial_schema.sql`
2. `20261010203000_managed_tenant_foundation.sql`
3. `20261010203100_submissions_collection_index.sql`
4. `20261015161000_platform_catalog_policies.sql` — gift catalogue, platform policies,
   store-owner invitations, reward↔catalogue linkage + synchronisation trigger
5. `20261015161100_tier_gift_options.sql` — per-bracket gift pools, composite tenant-safe FKs
6. `20261015161200_reward_engine_multipool.sql` — server-side uniform selection, pool + legacy
   fallback, shop-management RPCs (`create_shop`, `set_store_status`, `link_store_owner`,
   `admin_save_store_tiers`, `save_store_gift_options`)
7. `20261015170000_anon_grant_tightening.sql` — defence-in-depth grant revokes

Tables (14): previous 10 + `gift_catalog`, `tier_gift_options`, `platform_policies`,
`store_owner_invitations`. RLS enabled on all; pools invisible to anon.

Key engine semantics (Verified by 70-check harness):

- Brackets half-open `[min_amount, max_amount)`; floor `greatest(tier.min_amount,
  store.min_spin_amount)`; exactly one viable bracket else explicit error.
- **Option B pools**: `reward_tiers.reward_id` nullable; `tier_gift_options(store_id, tier_id,
  reward_id)` links materialised `rewards` rows (which carry `catalog_gift_id`); max 4 gifts
  per bracket enforced in `save_store_gift_options`; uniform selection persisted **before**
  the wheel; identical `request_id` replays the same claim; conflicting reuse rejected.
- Legacy fixed-reward brackets still work (fallback prize when a pool is empty).
- Claim code `coalesce(prefix,'GIFT') || '-' || upper(first 8 hex of request_id)`; single
  collection enforced; saved reward/claim immutable across refresh, retry, config changes.
- New-shop template: 11 contiguous brackets from ₹1,000 (`platform_policies.default_brackets`),
  `default_min_spin_amount=1000`, `max_gift_selections_per_bracket=4`.
- `create_shop` atomic + idempotent on slug; status `onboarding` until platform activation;
  platform can configure during onboarding, owners after activation.

`src/lib/database.types.ts` is **regenerated from the real staging schema** (2026-10-15) and
includes all new tables and RPCs (stale-types discrepancy resolved).

## 5. Protected production data (never touch)

- Submission `dsklks` → claim `GIFT-DDD89040` (₹50,000, PREMIUM GIFT).
- Owner account `oj@gmail.com` (store `00000000-0000-4000-a000-000000000001`,
  slug `jolly-enterprises`) and every genuine submission/reward/tier/claim.
- 8 rewards, 8 contiguous tiers (10000–20000 | … | 500000–open), `min_spin_amount` 10000.

## 6. Approved product decisions (unchanged)

- **Option B reward model**: multiple shop-approved gifts per bracket, equal probability,
  backend-selected and persisted before the wheel animation. No weighted odds in v1.
  Immutable saved rewards; idempotent retries; conflicting request ids rejected.
- Google Review Assistant optional and never reward-gating; neutral editable topic prompts
  only (verified by unit tests); clipboard writes only on explicit user action; skip always works.
- Central gift catalogue (platform), per-bracket gift selection (owners/platform, max 4),
  platform-enforced limits backend-side.
- New-shop template: 11 contiguous half-open brackets ₹1,000–10k–20k–40k–50k–1L–1.5L–2.5L–5L–10L–20L–open.
- Branding source of truth is saved shop data + logo; slug is a technical identifier.
- Deployment target `jriq.in` (root base `/`); GitHub Pages stays rollback until cutover.

## 7. Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 audit | Complete | Gap report delivered |
| 1 environment | Complete | Staging `jriq-staging` created + linked; MilesWeb outstanding (non-blocking) |
| 2 migrations | Complete on staging | 4 new migrations applied + verified 70/70; proposal amended (§0 corrections) |
| 3–5 catalogue / engine / platform admin | Complete on staging | Platform screens, vendor gift panel, engine pools, RPC authz |
| 6 customer flow polish | Complete | Neutral review prompts; wheel reveals saved reward (both modes) |
| 7 jriq.in deployment | Prepared, not deployed | root build + preflight + .htaccess ready; MilesWeb verification needs user login; DNS not resolving |
| 8 acceptance | In progress | Staging acceptance complete; production release proposal prepared |

## 8. Blockers (production-only)

1. Production release (migrations + backup + deploy + cutover) — **awaiting explicit user
   approval**; a verified `pg_dump` backup must exist before any production migration.
2. `jriq.in` deployment — DNS not resolving; MilesWeb hosting/SSL/document root Unknown;
   verification needs the user's dashboard login (one step at a time). Not blocking code.

## 9. Test evidence (2026-10-15)

| Gate | Command | Result |
|---|---|---|
| Unit + component tests | `npm test` | 216/216 (17 files) — exit 0 |
| Lint | `npm run lint` | exit 0 (warnings match pre-existing idiom) |
| TypeScript | `npx tsc -b` | exit 0 |
| Pages build | `npm run build` | exit 0 (base `/gift/`) |
| Root build | `npm run build:root` | exit 0 (base `/`) |
| Staging integration | `scripts/staging-verify.mjs` | **70/70 twice** — uniform selection χ²=6.00 < 13.8 (df=2), idempotency, immutability, collection, cross-tenant denial A↔B, platform-RPC denial, legacy fallback, onboarding semantics, template brackets |
| UI end-to-end (Playwright) | `scripts/ui-verify.mjs` | **27/27** — platform, vendor, and full customer journey on a shop created through the UI; screenshots `%TEMP%\jriq-ui-evidence`; only console message = intentional bad-login 400 probe |
| Preflight pages | `node scripts/preflight.mjs pages` | 10/10 (2 env warnings: local build is demo-mode; CI supplies `VITE_*`) |
| Preflight root | `node scripts/preflight.mjs root` | 9/9 (2 env warnings: demo-mode local build) — base `/`, `.htaccess` present |
| Secret scan | pattern scans on source + dist | clean |

New targeted test files: `src/lib/default-brackets.test.ts` (parses the real migration
artifact), `src/lib/reward-engine.pool.test.ts`, `src/lib/data/supabase.assignment.test.ts`,
`src/components/ui/GoogleReviewAssistant.test.tsx`, `src/features/platform/GiftPoolPanel.test.tsx`;
plus `getWheelSize` clamp tests in `SpinWinScreen.test.tsx` (negative SVG geometry fix).

## 10. Audit-trigger defect fix (2026-10-15)

**Legacy defect (VERIFIED, pre-existing since the managed-tenant migration):**
deleting any shop rolled back — `audit_managed_change()` wrote the dying
store's id into `platform_audit_logs.store_id` (FK to `stores`) from the same
statement's AFTER triggers, violating `platform_audit_logs_store_id_fkey`.
The FK's `ON DELETE SET NULL` never applies (the audit row is created after
the parent delete). One synthetic smoke shop (`c8831efe-...`) was stranded.

**Trigger audit:** 11 AFTER triggers call the function (stores, rewards,
reward_tiers, store_admins, store_subscriptions, subscription_plans,
tier_gift_options, gift_catalog, platform_policies, store_owner_invitations,
submissions collection updates). `platform_audit_logs` has exactly two FKs
(actor_id, store_id); no other audited entity can self-conflict. Defect paths:
direct store delete (observed), all store-delete cascades (child audit
triggers), and the equivalent actor case (auth.users self-deletion). Full
record: `docs/RELEASE_READINESS.md` section M.

**Chosen fix** (`supabase/migrations/20261015192000_audit_delete_ref_fix.sql`,
trigger side only): when the computed store/actor reference no longer exists,
insert the audit row with NULL in the FK column and preserve the id in the
existing `details` metadata (`deleted_store_id` / `deleted_actor_id`). Audit
rows stay durable and complete; valid references keep their linkage.

**Rejected alternative:** making `platform_audit_logs_store_id_fkey`
`DEFERRABLE INITIALLY DEFERRED` cannot fix this failure — the audit row is
inserted after its parent is gone, so neither the `ON DELETE SET NULL` action
nor a commit-time check ever sees a live parent row. Deferral would only move
the failure to COMMIT.

**Backup readiness:** the restore-tested backup `jwellery-20261015-150511.dump`
predates the four applied JRIQ migrations and the `CLEAN-0CBBDC9A` claim
(TOC-verified: zero JRIQ tables present). It is NOT a recovery point for
current state — a new verified `pg_dump` is mandatory before the production
fix (free-tier ops: keep last 4 weekly, `pg_restore --list` verify each run).

**Deliverables prepared (offline):** fix migration; `scripts/prod-smoke.mjs`
assertion corrections (public reads of stores/rewards asserted as the intended
customer-page model; vendor scoping asserted on private tables only;
`public_submission_rate_limits` counted on its real PK `store_id`; the smoke
now performs a normal create -> operate -> delete cycle and asserts the
deletion audit event survives with the store id recoverable from metadata);
`scripts/audit-fix-verify.mjs` (staging proof: two fresh create-operate-delete
cycles + live-store delete probes + the ten acceptance conditions);
`scripts/prod-residue-clean.mjs` (section-9 cleanup through the normal
deletion path with hard-abort semantics — no trigger bypass).

**Pending (blocked on DB connectivity):** staging migration + proof run;
`staging-verify.mjs` regression suite (reward, idempotency, collection, legacy
fallback, tenant isolation); new production backup; production migration +
full smoke (expect genuine 100%) + residue cleanup; then Phase M/C cutover
prep remains gated per the release gates.

## 11. Next actions

1. **User approves** `docs/PRODUCTION_RELEASE_PROPOSAL.md` (production migration + backup + deploy).
2. User performs the MilesWeb login step (Phase 7) when ready to wire `jriq.in`.
3. After approval: verified `pg_dump` → production migration → root build → upload →
   HTTPS/route checks → DNS cutover (GitHub Pages remains rollback).
