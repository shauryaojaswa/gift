# Evidence — Database schema, RPCs and security model inventory

Extracted from `supabase/migrations/*.sql` (15 files, filename order). All statements are
[Source-code findings]; line numbers refer to the migration files as they exist in the working
tree (including the two uncommitted 2026101715* migrations, which are **not applied to any
environment by this audit**).

## Tables (creation order)

| Table | First migration | Purpose | Key integrity |
|---|---|---|---|
| `stores` | 20261010202900 | tenant root (one shop) | `slug` unique + regex, `min_spin_amount > 0`, status CHECK, reserved-slug CHECK (20261016090000), HTTPS review-link CHECK (20261017150100) |
| `rewards` | 20261010202900 | per-store gift catalogue instance | FK `store_id` CASCADE, `unique(store_id,id)`, `wheel_label` NOT NULL (1–64), FK `catalog_gift_id` RESTRICT + partial unique (20261015161000) |
| `reward_tiers` | 20261010202900 | purchase brackets | `min_amount > 0`, `target_segment 0..7`, composite FK `(store_id,reward_id)` RESTRICT; `reward_id` nullable (legacy vs pool) |
| `submissions` | 20261010202900 | immutable issue + reward snapshot | `purchase_amount > 0`, name length CHECK, `unique(store_id,request_id)`, `collection_status ('awaiting','collected')`, `collected_by` SET NULL, FK `(store_id,reward_id)` RESTRICT |
| `store_admins` | 20261010202900 | owner/staff membership | `unique(store_id,user_id)`, role CHECK, FKs CASCADE |
| `platform_admins` | 20261010203000 | platform operators | `user_id` PK → auth.users CASCADE |
| `subscription_plans` / `store_subscriptions` | 20261010203000 | billing state | status + payment_status CHECKs, `store_id` unique CASCADE |
| `platform_audit_logs` | 20261010203000 | managed-change audit | actor/store FKs SET NULL |
| `public_submission_rate_limits` | 20261010203000 | per-phone throttle | PK `(store_id, phone_digest)`; all privileges revoked |
| `gift_catalog` | 20261015161000 | platform gift master | name/wheel_label CHECKs, value policy CHECKs (20261017150000), `excluded_store_ids` |
| `platform_policies` | 20261015161000 | tunables (max gifts/bracket, default brackets…) | key PK |
| `store_owner_invitations` | 20261015161000 | owner onboarding | `store_id` unique, email normalization CHECK, status CHECK |
| `tier_gift_options` | 20261015161100 | bracket gift pool | `unique(tier_id,reward_id)`, composite FKs CASCADE; `declared_value ≥ 0`, `quantity 1..100000`, `quantity_claimed ≥ 0` (20261017150000) |

## RPC / function inventory (all `SECURITY DEFINER`, `search_path = ''`)

- `is_platform_admin()` — membership test on `platform_admins`.
- `is_store_campaign_active(uuid)` — store active + subscription window.
- `is_store_admin(uuid)` — membership **and** campaign active.
- `submit_customer_entry(...)` (7 args) — the **only** way an anonymous customer creates a
  submission (table INSERT revoked from `anon`/`authenticated`). Validates name/amount/phone
  (`^[6-9][0-9]{9}$`), checks campaign active, enforces idempotent replay per `request_id`,
  rate limit 5/hour per phone digest, resolves exactly one bracket, then draws the prize
  **server-side**: `order by random() limit 1` over the bracket pool excluding exhausted stock
  (comment: "Built server-side only; the client never influences it"). Snapshots reward + tier +
  effective value into `submissions`, increments `quantity_claimed` atomically only when this call
  inserted. Returns `(submission_id, claim_code, reward jsonb, tier jsonb)`.
- `mark_submission_collected(uuid)` — one-way `awaiting → collected`, records `collected_by`.
- `save_store_tiers(jsonb)` / `admin_save_store_tiers(uuid,jsonb)` — bracket editor with
  contiguity/gap/overlap validation and per-segment gift uniqueness.
- `save_store_gift_options(uuid, uuid[], jsonb, jsonb)` — bracket pool editor: max-selection policy,
  per-shop `excluded_store_ids`, declared-value policy bounds, quantity bounds; **soft-deactivates**
  instead of deleting so `quantity_claimed` is preserved.
- `create_shop(...)` — idempotent shop provisioning: store `status='onboarding'`, default brackets,
  30-day trial, owner link or `unclaimed`; reserved-slug rejection.
- `link_store_owner(uuid,text)`, `set_store_status(uuid,text)`, `set_store_review_policy(uuid,bool)`,
  `rename_store_slug(uuid,text)` — platform-only management verbs.
- `get_store_gift_pool(text)` — display-only pool labels with effective value, excluding exhausted
  options; `STABLE`, callable by `anon` (read-only).
- Trigger functions: `audit_managed_change()`, `sync_catalog_gift_to_rewards()`, `touch_updated_at()`,
  `guard_store_review_link()` (HTTPS-only + platform-only edit when `review_link_owner_editable=false`).

## RLS model (summary)

- RLS enabled on **every** public table (15) plus storage policies for the `store-logos` bucket.
- **anon**: SELECT on active/addressable stores, active rewards/tiers/gift_catalog; EXECUTE on
  `submit_customer_entry`, `get_store_gift_pool`, `is_store_campaign_active`; **no writes anywhere**
  (`submissions` INSERT/UPDATE/DELETE explicitly revoked from `anon, authenticated`).
- **authenticated owner**: SELECT own store (`is_store_admin(id)`), column-level UPDATE on
  presentation fields only (`name, subtitle, logo_url, colors, google_review_url, campaign_badge,
  min_spin_amount`), `FOR ALL` on own `rewards`/`reward_tiers`/`tier_gift_options`, SELECT own
  `submissions`, own `store_admins` row.
- **platform admin** (`is_platform_admin()`): INSERT stores, `FOR ALL` on `store_admins`, manage
  `gift_catalog`/`platform_policies`/`store_owner_invitations`, read plans/subscriptions, audit log
  insert with `with check (actor_id = auth.uid())`.
- Defence-in-depth REVOKEs in 20261015170000 block direct table writes to policy/invitation/pool
  tables from non-platform roles.
- ON DELETE policy: CASCADE within a tenant, RESTRICT on reward references (a submission/tier can
  never outlive its reward), SET NULL on actor references.

## Where reward selection happens (settled question)

- **Supabase path: server-side.** Client calls only `submit_customer_entry`
  (`src/lib/data/supabase.ts:210-219`); the draw is `order by random()` in Postgres
  (20261017150000:541-549). The client animates the wheel onto the **returned** assignment
  (`SpinWinScreen.tsx:72-73`, `buildWheelSegments(options, rewardResult)` + `landingSegmentIndex`).
- **Demo path: client-side** (`local.ts:115-121`, `Math.random`) — demo mode only, explicitly
  documented as not a secure deployment.
- The wheel is presentation: `wheel-math.ts` computes geometry/animation; `reward-engine.ts`
  contains tier matching and segment layout used by the demo provider, validation and tests.
