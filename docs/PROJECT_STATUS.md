# JRIQ — Project Status

Last reconciled: 2026-10-15 (against actual repository, migrations and authenticated CLI output).
Evidence labels: **Verified** (command/file/authenticated response), **Reported** (user/audit), **Inferred**, **Unknown**.

## 1. Purpose and architecture

JRIQ is a multi-tenant jewellery rewards SaaS. One shared React SPA + one production Supabase
project serve many independently configured shops (tenants). Platform administrator manages
shops, the central gift catalogue and platform policies; shop owners manage their own shop's
gift selections; customers spin to reveal a server-assigned gift and receive a claim code.

Customer journey (working, live in production): branded landing → details form (₹ INR) →
"SHARE YOUR EXPERIENCE" review invitation (optional) → 12-card Google Review Assistant modal →
"WELCOME BACK!" → wheel reveal → reward + claim code → "THANK YOU!" screen.

## 2. Verified environment state (2026-10-15)

| Item | State | Evidence |
|---|---|---|
| Repo `C:\Users\ojaswa\Desktop\gift` | branch `staging`, clean, `cfa06e0` | git (Verified) |
| `main` | `cfa06e0` = `origin/main` | git (Verified) |
| `staging` | `cfa06e0` = `origin/staging` | git (Verified) |
| `gh-pages` | `4b0f17a` = `origin/gh-pages` | git (Verified) |
| Worktrees | main repo (`staging`), `gh-pages-live` (`gh-pages`), stale `deploy-main` (untouched) | git worktree list (Verified) |
| Public site | https://shauryaojaswa.github.io/gift/ → HTTP 200, latest CI run `success` @ `4b0f17a` | HTTP/API (Verified) |
| Test suite | 161/161 passing, lint 0, build 0 (re-verified 2026-10-14) | npm scripts (Verified) |
| Supabase CLI | v2.x via `npx.cmd` (PowerShell: never `npx.ps1`), authenticated | (Verified) |
| Docker / Podman | not installed — no local Supabase stack | (Verified) |
| `jriq-staging` project | **does not exist yet** | `supabase projects list` (Verified 2026-10-15) |

### Supabase projects

| Name | Reference | Status | Treatment |
|---|---|---|---|
| `jwellery` (production) | `awshkiwqkuubkhecszzk` (`ap-northeast-2`) | ACTIVE_HEALTHY | Preserve; no writes without approval |
| `checkpoint` | `essinjjyghevfylkfzwi` | INACTIVE | Never repurpose/reset |
| `shauryaojaswa's Project` | `nighrprmeewtxitlqela` | INACTIVE | Never repurpose/reset |
| `jriq-staging` | — | Not created | Free project, to be created via Dashboard (2 active projects fit free tier) |

### Domain and hosting

- `jriq.in`: **Reported** registered/active in MilesWeb dashboard, expiry **14 October 2027**
  (renewal deadline). DNS **Verified** NOT resolving on 2026-10-15 (`Resolve-DnsName` →
  DNS server failure). No DNS delegation, hosting plan, document root, SSL or upload method
  verified yet — MilesWeb checks outstanding (Phase 7, not blocking schema work).
- Existing deployment: GitHub Pages via Actions, `base: '/gift/'`, SPA restore via `404.html`.
  Deep-link document 404s are designed SPA-restore behavior. Pages serves `max-age=600`
  cached `index.html` — cache-bust when verifying. Transient deploy-step failures have
  occurred twice; fixed by pushing an empty commit.

## 3. Technology stack (Verified: package.json)

React 19.2.8 · React Router 7.18.4 · Vite 8.0.10 · Tailwind CSS 3.4.21 · Zustand 4.5.7 ·
TypeScript 5.8 · Supabase JS 2.75 · date-fns. Package manager: npm (`package-lock.json`).
No Next.js/Remix/Redux migrations — stack stays as-is.

## 4. Database (Verified: migration history in `supabase/migrations/`, remote apply state
`migration list --linked` Local==Remote as of 2026-10-14)

Migrations: `20261010202900_initial_schema.sql`, `20261010203000_managed_tenant_foundation.sql`,
`20261010203100_submissions_collection_index.sql`. Additive-only history; never rewritten.

Tables (10): `stores`, `rewards`, `reward_tiers`, `submissions`, `store_admins`,
`platform_admins`, `subscription_plans`, `store_subscriptions`, `platform_audit_logs`,
`public_submission_rate_limits`. RLS enabled on all.

Functions (7): `submit_customer_entry`, `mark_submission_collected`, `save_store_tiers`,
`is_platform_admin()`, `is_store_admin(uuid)`, `is_store_campaign_active(uuid)`,
`audit_managed_change()` (trigger). All SECURITY DEFINER with `search_path = ''`.
Grants: `submit_customer_entry` → anon+authenticated; others authenticated-only;
`is_platform_admin`/`is_store_admin` revoked from public/anon.

Key structural facts (Verified in DDL):

- `stores.slug` unique, `^[a-z0-9]+(-[a-z0-9]+)*$`; `status` in
  (`active`,`suspended`,`onboarding`); `min_spin_amount` (default 10000, > 0).
- `rewards` is **per-store** (`store_id` NOT NULL, unique `(store_id, id)`).
- `reward_tiers.reward_id` composite FK `(store_id, reward_id) → rewards ON DELETE RESTRICT`;
  `submissions.reward_id` same FK shape.
- `submissions` already stores a **full immutable reward snapshot** (reward_label,
  reward_description, reward_claim_code_prefix, reward_validity_text, reward_wheel_label,
  reward_voucher_value) plus assigned tier bounds and `target_segment`.
- Idempotency: `submissions.id = request_id`; unique `(store_id, request_id)`;
  identical retries replay, conflicting reuse rejected.
- Claim code: `coalesce(claim_code_prefix,'GIFT') || '-' || upper(first 8 hex of request_id)`.
- Collection: `collection_status` (`awaiting`/`collected`) + `collected_at`/`collected_by`;
  `mark_submission_collected` rejects double collection.
- Public rate limit: 5 submissions/hour per (store, phone-digest), sha256 digest.
- Bracket resolution: half-open `[min_amount, max_amount)`, floor at
  `greatest(tier.min_amount, store.min_spin_amount)`; exactly one active tier must match,
  joined to exactly one active reward, else the RPC raises.
- `save_store_tiers(p_tiers jsonb)` validates: contiguity (no gaps/overlaps, last open-ended),
  first tier starts at `min_spin_amount`, one gift per `target_segment` (0–7), tier belongs
  to caller's store. Note: caller store is derived `... limit 1` — single-store assumption.
- Storage: public bucket `store-logos`, per-store folder scoping via policies.
- Audit: `platform_audit_logs` fed by triggers on stores/rewards/tiers/membership/
  subscription/plan changes and collection-status updates.

### Known discrepancy

`src/lib/database.types.ts` is **stale**: it omits `platform_admins`, `subscription_plans`,
`store_subscriptions`, `platform_audit_logs`, `public_submission_rate_limits` and the
`is_*`/`audit_*` functions. Regenerate from the real schema at the next schema-touching
phase (requires a DB connection; do after staging link).

## 5. Protected production data (never touch)

- Submission `dsklks` → claim `GIFT-DDD89040` (₹50,000, PREMIUM GIFT).
- Owner account `oj@gmail.com` (store `00000000-0000-4000-a000-000000000001`,
  slug `jolly-enterprises`) and every genuine submission/reward/tier/claim.
- 8 rewards, 8 contiguous tiers (10000–20000 | 20000–40000 | 40000–50000 | 50000–100000 |
  100000–150000 | 150000–250000 | 250000–500000 | 500000–open).

## 6. Approved product decisions

- **Option B reward model** (approved): multiple shop-approved gifts per purchase bracket,
  equal probability, backend-selected and persisted before the wheel animation. No weighted
  odds in first release. Identical retries replay; conflicting `request_id` reuse rejected;
  saved reward/claim immutable across refresh, retry and config changes.
- Google Review Assistant stays optional, never affects eligibility/value; replace
  testimonial-style suggestion copy with neutral editable topic prompts (Google policy);
  copy only on user-initiated action; skip route always works.
- Central gift catalogue managed by platform admin; shops select within platform rules;
  platform enforces limits backend-side.
- Branding source of truth is saved shop data + logo; slug is a technical identifier.
- Deployment target `jriq.in` (root base `/`), GitHub Pages kept as rollback until cutover
  is approved.

## 7. Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 audit | Complete | Gap report G1–G7 delivered |
| 1 environment | Partial | Repo/CLI/production verified; `jriq-staging` pending creation; MilesWeb outstanding (not blocking) |
| 2 migration proposal | **Drafted — awaiting approval** | `docs/MIGRATION_PROPOSAL.md` |
| 3–5 catalogue / engine / platform admin | Not started | Blocked on proposal approval + staging |
| 6 customer flow polish | Not started | Review-copy policy fix pending |
| 7 jriq.in deployment | Not started | Blocked on MilesWeb verification |
| 8 acceptance | Not started | |

## 8. Blockers

1. `jriq-staging` Supabase project not created (user: Dashboard step, one action).
2. MilesWeb hosting verification outstanding (Phase 7 only).
3. Production `pg_dump` backup must be captured (actual run, not a documented command)
   before any production migration.

## 9. Next actions

1. User: create free project `jriq-staging` (Dashboard, region prefer `ap-northeast-2`).
2. Agent: verify staging identity/emptiness, link for staging work only, seed synthetic tenants.
3. User: approve `docs/MIGRATION_PROPOSAL.md` (includes one business question:
   default purchase-bracket template for new shops).
4. Agent: apply approved migration to staging only; implement platform admin + Create Shop,
   vendor gift selection, engine changes; add isolation/authz tests.

## 10. Operating rules (standing)

- No production migrations/writes, DNS changes, deploys, purchases or plan upgrades without
  explicit approval. Additive migrations only; never rewrite applied migration history.
- Never commit/ship secrets; no service-role keys in frontend or `VITE_*` vars; no passwords
  in chat. Service-role usage is local-shell-only for provisioning/cleanup.
- Evidence labels on every claim; tests use synthetic data in staging only.
