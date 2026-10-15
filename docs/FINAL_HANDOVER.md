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

Staging is the release branch for now. Production release = the approved proposal:
`pg_dump` (verified) → 4 migrations → frontend deploy (Pages merge or MilesWeb upload) →
smoke. GitHub Pages stays the rollback target until `jriq.in` cutover is approved.
Adding a shop = platform admin UI action — **no deploy, no DNS**.
