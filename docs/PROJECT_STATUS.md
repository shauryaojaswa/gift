# JRIQ — Project Status

Last reconciled: 2026-10-16 (post-launch — against actual repository, migrations, production
and staging projects and authenticated CLI output).
Evidence labels: **Verified** (command/file/authenticated response), **Reported** (user/audit),
**Inferred**, **Unknown**.

> **Launch record — 2026-10-16 (08:38 IST / 03:08 UTC): `jriq.in` is live and verified.**
> Cutover matrix 6/6, 60-min watch 30/30 rounds clean (2026-10-15 20:06 -> 21:04 UTC),
> MilesWeb PRIMARY, GitHub Pages `/gift/` honored fallback. Declarations and evidence:
> `docs/FINAL_HANDOVER.md` §11.

> **v1.1.0 DEPLOYED — 2026-10-16 (owner-approved): URL restructure live on `jriq.in`.**
> Tag `v1.1.0 -> 7cbe8d6` (`ls-remote` verified). All gates green pre-deploy:
> unit 269/269 · staging-verify 70/70 · slug-swap 72/72 · prod-smoke pattern 28/28 ·
> URL acceptance 72/72 on both builds · preflight root 11/11 + pages 12/12 (prod env).
> Production: 2 additive migrations applied + history-recorded (10 rows), protected
> claims 2/2 intact; deploy-verify 10/10 (bundle `index-BKFS76nG.js`), production smoke
> 35/35, live proof `/store/jolly-enterprises` -> `/jolly-enterprises` lossless and `/`
> = platform homepage. Record + rollback: `docs/V1.1.0_RELEASE_PROPOSAL.md` §7-8.

> **v1.1.1 DEPLOYED — 2026-10-16 (owner-approved artifact refresh): strict legacy 301
> live.** Tag `v1.1.1 -> d3b158a` (`ls-remote` verified; the exact deployed artifact).
> Zero database changes. Production serves `index-ByWVxrmy.js`: `public/.htaccess`
> answers `/store/{slug}` with a real HTTP **301** + exact `Location` to `/{slug}`
> (Phase-2 BLOCKED gate closed → live evidence), Overview QuickLinks slug-scoped,
> acceptance rows A6b/A8b/A8c added. Backup `jwellery-20261016-142256.logical.json`
> (validated). Post-deploy: byte-verify 50/50 · deploy-verify 11/11 · prod-smoke 35/35 ·
> live matrix 15/18 (3 classified findings, no rollback trigger) · 30-min watch
> 10/10 rounds clean (50/50 checks). Record: `docs/FINAL_HANDOVER.md` §12.

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

- `jriq.in` (reconciled against live state, 2026-10-16):
  - **Registration**: Active, registered 2026-10-14, expires **14 October 2027**; registrar
    of record = Hosting Concepts B.V. dba **Openprovider** (IANA 1647) — sold via MilesWeb
    (REPORTED by user; RDAP corroborates a reseller path). Domain id 74851 in the MilesWeb
    client area.
  - **DNS**: zone live at MyDNSVault — delegation `luna/odin/neon.mydnsvault.com`, SOA
    serial `2026101500`, apex A `45.199.139.29`, TTL 300 (deliberately retained —
    `docs/DEPLOYMENT.md` §5.4), no AAAA. Resolves locally and via 1.1.1.1 (VERIFIED).
  - **Hosting**: MilesWeb "Premium" (mPanel), Active, bound to `jriq.in`; document root
    `public_html`; the verified `dist/` is deployed and serving (VERIFIED 2026-10-16).
  - **TLS**: trusted chain, valid to **2027-01-13** (AutoSSL at provisioning) (VERIFIED).
  - **Live deployment**: **`jriq.in` is PRIMARY since 2026-10-16** (SPA fallback honoured
    through BitNinja/Caddy); GitHub Pages `/gift/` remains live as the honored fallback.
    Full facts + evidence: `docs/DEPLOYMENT.md` §5.
  - DB egress to Supabase pooler (5432) **works from this machine** (pg_dump, psql,
    `supabase migration up` all executed here) — supersedes the earlier "blocked" note.
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

Migration history (8 migrations; additive only; never rewritten). Local == Remote on
staging (Verified `supabase migration list --linked`, 2026-10-15); production
`schema_migrations` = 8 (VERIFIED 2026-10-15):

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
8. `20261015192000_audit_delete_ref_fix.sql` — **defect fix** (store-deletion audit):
   trigger-side audit capture chosen by executable experiment; the rejected DEFERRABLE
   variant is documented with proof in `docs/RELEASE_READINESS.md` M.4. Applied to
   staging + production 2026-10-15 (verified backup first); `schema_migrations` = 8.

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
| 7 jriq.in deployment | **Complete — LIVE 2026-10-16** | verified `dist/` (`a63ca38`) deployed to MilesWeb via mPanel File Manager HTTP API; SPA fallback + TLS + asset byte-match verified; **`jriq.in` PRIMARY**, Pages `/gift/` honored fallback |
| 8 acceptance + cutover | **Complete** | production release 2026-10-15 (backup -> 5 migrations -> prod-smoke 35/35); cutover matrix 6/6 VERIFIED; 60-min watch 30/30 rounds (120/120 checks), zero blips, no trigger fired |

## 8. Blockers — all cleared (2026-10-16)

1. ~~Production release awaiting approval~~ — **executed 2026-10-15** with verified backup
   `jwellery-20261015-203239.dump` before any migration.
2. ~~`jriq.in` deployment~~ — **live and verified 2026-10-16** (`docs/DEPLOYMENT.md` §5).

Open items (none gate production):

- ~~**URL restructure** (root-level slugs `/{slug}`, per-shop `/{slug}/admin`, homepage
  rebuild)~~ — **shipped**: live as `v1.1.0 -> 7cbe8d6` and refreshed as
  `v1.1.1 -> d3b158a` (strict legacy 301 live).
- **GitHub Pages fallback refresh — decision requested**: the Pages host serves a
  pre-v1.0.0 build (`docs/DEPLOYMENT.md` §4 state finding; legacy QR links still work
  there). Documented one-merge procedure; no production-side action taken without
  explicit approval.
- **v1.1.2 hardening queue (out of scope until explicitly approved)**: DB slug length cap
  `length(slug) <= 60`; owner self-rename of the shop slug (`docs/FINAL_HANDOVER.md`
  §12 deviation 11).
- **TTL raise 300 -> 3600** — deliberate deferral, revisit at >1000 daily visitors or
  90 days stable (`docs/DEPLOYMENT.md` §5.4, `docs/FINAL_HANDOVER.md` §11).
- **Rotate known-rotation credentials** — owner test-account password and the Supabase
  dashboard password (`docs/FINAL_HANDOVER.md` §11 deviations 1 and 4); both recorded as
  tasks only, never values.

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

**Rejected alternative (settled by executable experiment, 2026-10-15):**
making `platform_audit_logs_store_id_fkey` `DEFERRABLE INITIALLY DEFERRED`
cannot fix this failure — the audit row is inserted after its parent is gone,
so neither the `ON DELETE SET NULL` action nor a commit-time check ever sees a
live parent row. A three-variant local PostgreSQL 17.6 experiment (defect
reproduction / DEFERRABLE / trigger-side fix, identical scenario) confirmed it
directly: with the DEFERRABLE FK the `DELETE` statement is accepted but the
transaction's COMMIT fails with the same FK violation and rolls back (store
retained, audit row lost) in both autocommit and explicit-transaction forms —
deferral only moves the failure to COMMIT. The trigger-side fix commits the
delete and preserves the audit row. Evidence: `docs/RELEASE_READINESS.md` M.4.

**Backup readiness:** the restore-tested backup `jwellery-20261015-150511.dump`
predates the four applied JRIQ migrations and the `CLEAN-0CBBDC9A` claim
(TOC-verified: zero JRIQ tables present). It is NOT a recovery point for
current state — a new verified `pg_dump` is mandatory before the production
fix (free-tier ops: keep last 4 weekly, `pg_restore --list` verify each run).

**Deliverables prepared (offline):** fix migration; `scripts/prod-smoke.mjs`
assertion corrections (public reads of stores/rewards asserted as the intended
customer-page model; vendor scoping asserted on private tables only;
`public_submission_rate_limits` counted on its real PK `store_id`; the smoke
now performs a normal create -> operate -> delete cycle with spec cleanup
order — smoke audit rows referencing the store are removed before the store
deletion, the deletion event is asserted (FK null, store id recoverable from
metadata) and then cleaned, and the audit total returns to baseline);
`scripts/audit-fix-verify.mjs` (staging proof: two fresh create-operate-delete
cycles + live-store delete probes + the ten acceptance conditions);
`scripts/prod-residue-clean.mjs` (section-9 cleanup through the normal
deletion path with hard-abort semantics — no trigger bypass).

**Residue target verified read-only (2026-10-15 19:50 IST, service-role REST):**
exactly one synthetic shop matches: id `c8831efe-9354-4fcc-93dc-6a2cd6b32dcd`,
name "Smoke Shop mv9fxehs", slug "smoke-mv9fxehs", active, min_spin 1000,
created 2026-10-15T11:13:47Z. Child recheck: 0 rows in all 9 child tables
(incl. rate limits on its real PK). Protected records verified intact:
GIFT-DDD89040 (50,000/awaiting), CLEAN-0CBBDC9A (15,000/awaiting), real shop
8 tiers / 8 rewards, owner mapping 1x role owner.

**Executed and VERIFIED (2026-10-15 evening, Supavisor session-mode pooler):**
staging migration applied (exit 0, `schema_migrations` 7→8) → `audit-fix-verify.mjs`
23/23 exit 0 (two create→operate→delete cycles, 10 acceptance conditions +
live-store no-over-nulling probes) → `staging-verify.mjs` regression 70/70 exit 0
→ mandatory pre-change backup `jwellery-20261015-203239.dump` (552,410 B,
`pg_restore --list` exit 0, 914 TOC entries incl. all 4 JRIQ tables) → production
migration applied (exit 0, 8 migrations, function verified, 11 triggers intact) →
residue `c8831efe-…` deleted through the NORMAL store-delete path
(`prod-residue-clean.mjs` 14/14 exit 0 — the fix's production test; deletion
audit row kept `fbbbe474-…`) → production smoke `prod-smoke.mjs` 35/35 exit 0
(full create→operate→delete cycle). Audit log: 27 baseline + 1 kept deletion
event = 28, verified. Full evidence: `docs/RELEASE_READINESS.md` M.7/M.9.

**Remaining (post-fix):** Phase M MilesWeb provisioning (user login required),
Phase C cutover (gated on M + explicit authorization), Phase H handover docs.

## 11. Next actions

1. **Owner decision requested — GitHub Pages fallback refresh**: the Pages host serves a
   pre-v1.0.0 build (`docs/DEPLOYMENT.md` §4). The procedure (merge `staging` into
   `gh-pages`, push, watch the Actions run) is documented and low-risk; it is a
   production-side action and will not run without explicit approval.
2. **In flight — final delivery prompt (staging only; Phase 5 stops for approval)**:
   vision + visual gap audit with a 390×844 customer-side visual audit (P0-1 — includes
   the v1.1.1 matrix findings: `store.name` never rendered on the customer landing, and
   the broken `<img>` logo fallback for logo-less shops), customer-side polish pass, New
   Shop wizard + deliverables result screen (P1-1), vendor self-service verification
   (P0-3), snapshot-driven `scripts/e2e-vision.mjs` with demo-kit screenshots (P1-2),
   onboarding runbook + demo kit (Phase 4), then a written production proposal (Phase 5)
   that **stops for owner approval**.
3. **v1.1.2 hardening queue (needs explicit future approval)**: DB slug length cap
   `length(slug) <= 60`; owner self-rename of the shop slug; optional `create_shop`
   unique_violation mapper; `MyQrCodePage`/`Standee` QR harmonisation onto
   `getCampaignUrl` (`docs/FINAL_HANDOVER.md` §12 deviation 11).
4. **Known-rotation credentials** (tasks only, never values): owner test-account password,
   Supabase dashboard password (`docs/FINAL_HANDOVER.md` §11 deviations 1 and 4).
5. **TTL raise 300 -> 3600** at >1000 daily visitors or 90 days stable (§8).
6. **Weekly `pg_dump` keep-last-4** resumes the first time a machine has pooler egress;
   validate with `pg_restore --list` then (`docs/FINAL_HANDOVER.md` §8, deviations 5/8).
