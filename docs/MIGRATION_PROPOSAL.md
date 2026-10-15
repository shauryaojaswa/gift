# JRIQ Phase 2 — Migration Proposal (REVIEW REQUIRED — NOT APPLIED)

Status: **Approved for staging (2026-10-15 execution order) — implementation in progress.**
The new-shop default template in §6 is adopted as specified in the execution order.
Nothing here has been applied to production; production application requires a verified
backup and separate explicit approval.

## 0. Amendment record (2026-10-15, review pass before implementation)

Deficiencies found on re-review and fixed in the sections below:

1. **`reward_tiers.reward_id` must become nullable** (§3.6). It is `NOT NULL` today, which
   would force every pool-based bracket to carry a meaningless placeholder reward. Making it
   nullable is non-destructive (`DROP NOT NULL`); existing rows keep their values.
2. **`tier_gift_options` links brackets to shop `rewards` rows, not directly to catalogue
   rows** (§3.2). `submissions.reward_id` and `reward_tiers.reward_id` both FK into
   `rewards(store_id, id)`, so an assigned prize must resolve to a `rewards` row. A shop's
   selection of a catalogue gift is therefore materialized as a `rewards` row carrying
   `catalog_gift_id` (§3.5), and the option table references that row. This keeps every
   existing FK, query and UI shape valid.
3. **Materialization point defined** (§4.1): `save_store_gift_options` creates/updates the
   store-local `rewards` row for each selected catalogue gift inside the same transaction.
   The `gift_catalog` sync trigger (§3.5) keeps display fields fresh; submissions keep
   their own immutable snapshot either way.
4. **`admin_save_store_tiers` relaxation** (§4.2): pool-based brackets may have
   `reward_id = null`; `target_segment` becomes a display hint (duplicates allowed on the
   admin path). The legacy one-gift-per-segment rule stays in `save_store_tiers`, which is
   unchanged for existing owner workflows.
5. **Onboarding recovery made explicit** (§4.3): `create_shop` is one transaction, idempotent
   on slug, and new shops start `status='onboarding'` so the public flow stays closed until
   the platform admin activates — a partially configured shop can never award prizes.

Evidence basis: migration history in `supabase/migrations/` (all three verified applied to
production 2026-10-14, Local==Remote), read-only schema inspection, and the verified live
behaviour of the current customer flow. All schema statements below are **Verified** from
DDL unless labelled otherwise.

---

## 1. Current-schema findings (relevant to the proposal)

- `rewards` is **per-store** (`store_id NOT NULL`, unique `(store_id, id)`) — the platform
  has *no* shared gift catalogue today; each shop owns its own reward rows.
- `reward_tiers.reward_id` is `NOT NULL` with composite FK
  `(store_id, reward_id) → rewards(store_id, id) ON DELETE RESTRICT`.
- `submissions.reward_id` has the same composite FK `ON DELETE RESTRICT`, and submissions
  already store an immutable reward snapshot (label, description, prefix, validity,
  wheel label, voucher value) + assigned tier bounds. **Historical-claim immutability is
  therefore already structurally in place.**
- `submit_customer_entry` currently requires exactly one active tier match joined to
  exactly one active reward (`v_match_count <> 1` raises). One fixed gift per bracket.
- Idempotency is solid: `submissions.id = request_id`, unique `(store_id, request_id)`,
  identical retries replay from saved snapshot; conflicting reuse raises.
- `save_store_tiers(p_tiers jsonb)` enforces contiguity, min-spin alignment, one gift per
  wheel segment (0–7), and store ownership of tier IDs. Caller's store is derived with
  `... limit 1` (single-store assumption — a limitation for platform-admin tooling).
- Platform scaffolding exists: `platform_admins`, `is_platform_admin()`, `store_admins`
  + `is_store_admin()`, `subscription_plans`, `store_subscriptions`,
  `is_store_campaign_active()` (store must be `active` + `status='active'` + subscription
  trial/active), `platform_audit_logs` + audit triggers, per-phone rate limiting,
  `store-logos` storage bucket with per-store folder policies.
- Gaps versus requirements: (G1) no central gift catalogue; (G2) no shop-selection entity;
  (G3) one gift per bracket only; (G4) no Create Shop backend path; (G5) no owner
  invitation/linking mechanism; (G6) no platform policy store (limits/defaults);
  (G7) `src/lib/database.types.ts` is stale (omits 5 tables, 4 functions).

## 2. Design principles applied

- **Additive only.** No `DROP`, no data rewrites, no column removals. Existing rows and
  behaviour are untouched; the new engine path falls back to today's exact behaviour when a
  bracket has no selections.
- **No competing tables.** The existing `stores`, `rewards`, `reward_tiers`, `submissions`
  concepts are extended, not duplicated. New tables only cover genuinely new concepts
  (platform catalogue master, platform policies, bracket↔gift relationship, owner
  invitations).
- **FK-safe assignment.** Because `submissions.reward_id` must reference a `rewards` row,
  a shop's *selection* of a catalogue gift materializes as a linked `rewards` row
  (`catalog_gift_id`), keeping all existing FKs, queries and UI shapes valid.

## 3. Proposed schema changes

### 3.1 New table `public.gift_catalog` (platform-managed master — concept "catalogue gift")

| column | type | notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| name | text NOT NULL | display name |
| wheel_label | text NOT NULL | 1–18 chars (same constraint as rewards) |
| description | text | |
| image_url | text | optional; stored in `store-logos` bucket or public URL |
| voucher_value | integer NULL check >= 0 | value metadata |
| claim_code_prefix | text NULL | e.g. `GIFT` |
| validity_text | text NULL | |
| active | boolean NOT NULL default true | inactive gifts cannot enter any pool |
| created_at / updated_at | timestamptz NOT NULL default now() | |

RLS: `select` for anon+authenticated where `active`; `all` for `is_platform_admin()`.
Audit trigger `audit_managed_change` attached (uses `platform_audit_logs`; `store_id` null).

### 3.2 New table `public.tier_gift_options` (bracket↔gift relationship — concept "bracket to which the selection applies")

| column | type | notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| store_id | uuid NOT NULL | denormalized tenant scope for RLS + composite FK |
| tier_id | uuid NOT NULL → reward_tiers(id) ON DELETE CASCADE | the bracket |
| reward_id | uuid NOT NULL | the shop's materialized reward row (§3.5) |
| active | boolean NOT NULL default true | |
| created_at / updated_at | timestamptz | |

Constraints: `unique (tier_id, reward_id)`; composite FK
`(store_id, tier_id) → reward_tiers(store_id, id) ON DELETE CASCADE`;
composite FK `(store_id, reward_id) → rewards(store_id, id) ON DELETE CASCADE`.
Deleting a shop reward or a tier cleanly removes its option rows; deleting a catalogue gift
is impossible while referenced (`rewards.catalog_gift_id` is `ON DELETE RESTRICT`, and the
platform admin deactivates instead of deleting).
Indexes: `tier_id`, `(store_id, reward_id)`.
RLS: `all` for `is_store_admin(store_id) or is_platform_admin()`; **no anon read**
(pools are exposed to customers only through `submit_customer_entry`, which returns the
single assigned gift — pools must not leak odds/prize lists). `rewards` needs a matching
`unique (store_id, id)`-compatible FK target — already present in the existing schema.

### 3.3 New table `public.platform_policies` (concept "platform-controlled policies/defaults")

| column | type | notes |
|---|---|---|
| key | text PK | e.g. `max_gift_selections_per_bracket`, `default_min_spin_amount`, `default_brackets` |
| value | jsonb NOT NULL | |
| updated_at / updated_by | timestamptz / uuid→auth.users | |

Seeded values (proposal defaults, changeable in platform UI):
`max_gift_selections_per_bracket = 4`, `default_min_spin_amount = 1000`,
`default_brackets` = template in §6.
RLS: `select` for authenticated; write for `is_platform_admin()` only.

### 3.4 New table `public.store_owner_invitations` (concept "owner invitation state")

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| store_id | uuid NOT NULL unique → stores(id) ON DELETE CASCADE | one pending owner per shop |
| email | text NOT NULL | lower-cased |
| status | text NOT NULL check in ('pending','linked','revoked') default 'pending' | |
| invited_by | uuid → auth.users | platform admin |
| created_at / linked_at | timestamptz | |

RLS: `is_platform_admin()` only. No credentials, no tokens: the owner creates their own
Supabase Auth account at `/vendor/login` with that email, then the platform admin presses
"Link owner" (backend-verified lookup). This avoids any service-role key in the frontend.

### 3.5 Alter `public.rewards` (additive)

- `add column catalog_gift_id uuid null references public.gift_catalog(id) ON DELETE RESTRICT`.
  Non-null ⇔ this row is the shop's selection instance of a catalogue gift, materialized by
  `save_store_gift_options` (§4.1). Index on `catalog_gift_id`; partial unique
  `(store_id, catalog_gift_id) where catalog_gift_id is not null` — one instance per gift
  per shop.
- Sync trigger on `gift_catalog` UPDATE: propagate `name, wheel_label, description,
  voucher_value, claim_code_prefix, validity_text` to linked `rewards` rows. The catalogue
  remains the single mutable source; shop rows never become stale copies. Submissions keep
  their own immutable snapshot regardless.

### 3.6 Alter `public.reward_tiers` (additive, non-destructive)

- `alter column reward_id drop not null` — pool-based brackets need no placeholder reward.
  Existing rows are untouched (all production tiers keep their `reward_id`).
- Invariant enforced in the write RPCs: every tier must have `reward_id` **or** at least one
  active `tier_gift_options` row; the engine raises explicitly if neither exists.

## 4. Reward engine changes (Option B — equal probability, server-authoritative)

`submit_customer_entry` keeps its **exact signature and return shape** (frontend-compatible).
Internal selection becomes:

1. Validate store active + campaign-active (unchanged), phone, name, amount (unchanged).
2. Idempotent replay of identical `request_id` (unchanged); conflicting reuse rejected (unchanged).
3. Rate limit (unchanged).
4. Resolve exactly one active tier for the amount (unchanged, half-open brackets).
5. **Pool construction (new):** active `tier_gift_options` rows for the tier → active
   `rewards` rows in the same store (each optionally catalogue-linked; the linked
   `gift_catalog` row must also be active). Inactive options, inactive rewards and inactive
   catalogue entries can never enter the pool.
6. **Uniform selection (new):** `order by random() limit 1` inside the SECURITY DEFINER
   function (trusted server-side randomness). `random()` is not cryptographic; the prize is
   not a security boundary here because the pool itself is server-built and persisted, but
   distribution must be verified in tests (§8).
7. **Fallback (compatibility):** if the tier has zero active option rows, use the tier's
   legacy `reward_id` exactly as today. Existing shops (including `jolly-enterprises`) therefore
   behave **identically** until someone opts a bracket into multi-gift.
8. Persist assignment + snapshot + claim code before returning (unchanged). If a bracket has
   no options and no usable legacy reward, raise an explicit error (unchanged wording
   path) rather than awarding anything else.
9. Return the saved result; the wheel only animates to it.

### 4.1 Materialization (`save_store_gift_options`)

For each requested `catalog_gift_id`: verify the catalogue row exists and is active; ensure a
store-local `rewards` row with that `catalog_gift_id` exists (insert with display fields
copied from the catalogue when missing, `wheel_label` truncated to the 1–18 constraint);
then upsert `tier_gift_options` rows and deactivate/remove rows not in the request. All in
one transaction, with `max_gift_selections_per_bracket` enforced on the active result.

### 4.2 `admin_save_store_tiers` (platform path)

Same validation core as `save_store_tiers` (contiguity, min-spin alignment, tier-ID
ownership) plus: `reward_id` may be null when the tier carries active options; `target_segment`
is a display hint on this path (duplicates allowed). The legacy one-gift-per-segment rule is
unchanged in `save_store_tiers`.

### 4.3 `create_shop` (onboarding + recovery)

Single transaction: insert `stores` (slug regex + unique, `status='onboarding'`),
insert the bracket template (§6) as `reward_tiers` rows (`reward_id` null),
insert `store_subscriptions` (trial), then link the owner if an auth user with that email
exists, else insert `store_owner_invitations` (`pending`). Slug retry with identical name
returns the existing shop (idempotent); different content raises. A transaction rollback is
the only partial-failure outcome, so retries can never duplicate shops or ownership. The
public flow stays closed (`is_store_campaign_active` requires `status='active'`) until the
platform admin activates the shop.

Guarantees preserved: assignment persisted before reveal; identical retries return the same
claim/reward; conflicting `request_id` reuse rejected; config changes after assignment never
alter saved rewards (snapshot + RESTRICT FK); double collection rejected
(`mark_submission_collected` unchanged); client-supplied gift ids are never trusted.

### New/changed RPCs

| object | change | auth |
|---|---|---|
| `submit_customer_entry(...)` | replaced (same signature/returns; pool + uniform pick + fallback) | anon+authenticated (unchanged) |
| `save_store_gift_options(p_tier_id uuid, p_catalog_gift_ids uuid[])` | **new** — materializes catalogue selections (§4.1), upserts option rows; enforces `max_gift_selections_per_bracket`, gift `active`, tier ownership | authenticated; caller must be store admin of the tier's store or platform admin |
| `admin_save_store_tiers(p_store_id uuid, p_tiers jsonb)` | **new** — platform-admin variant of `save_store_tiers` with explicit store (fixes the `limit 1` limitation); pool-tier rules per §4.2 | `is_platform_admin()` |
| `create_shop(p_name text, p_slug text, p_owner_email text, p_logo_url text, p_tiers jsonb default null)` | **new** — per §4.3; returns shop id/slug/customer URL/owner-link status | `is_platform_admin()` |
| `link_store_owner(p_store_id uuid, p_email text)` | **new** — backend lookup of `auth.users` by email, inserts `store_admins` (role 'owner'), marks invitation `linked`, audited; idempotent | `is_platform_admin()` |
| `set_store_status(p_store_id uuid, p_status text)` | **new** — activate/suspend/onboard shop, audited | `is_platform_admin()` |
| `mark_submission_collected`, `save_store_tiers` | unchanged | unchanged |

All new functions: `SECURITY DEFINER`, `set search_path = ''`, schema-qualified references,
explicit `is_platform_admin()`/`is_store_admin()` checks, `revoke all ... from public, anon`,
least-privilege grants, audit-trail inserts for platform actions.

## 5. RLS and grants summary

| object | anon | authenticated (store admin) | platform admin |
|---|---|---|---|
| `gift_catalog` | select active rows | select active rows | all |
| `tier_gift_options` | none | all on own store's rows | all |
| `platform_policies` | none | select | all |
| `store_owner_invitations` | none | none | all |
| `rewards`, `reward_tiers`, `stores`, `submissions`, `store_admins` | as today (unchanged) | as today | as today |
| new RPCs | — | per table above | per table above |

Shop owners cannot write catalogue entries, policies, invitations, or other tenants' rows —
enforced in RLS and inside SECURITY DEFINER functions, not in the UI.

## 6. Purchase bracket policy

- Bracket boundaries remain **per-shop** (`reward_tiers`) because the schema, `save_store_tiers`
  and the working vendor UI already work that way; the platform controls the **approved
  default template** applied at shop creation and may edit any shop's brackets
  (`admin_save_store_tiers`). Shop owners keep editing gift selections within brackets;
  bracket boundary editing by owners is proposed to move behind platform control
  (behaviour change — flagged in §9).
- Resolution rules unchanged: half-open `[min, max)`, floor at
  `greatest(min_amount, min_spin_amount)`, top bracket open-ended, contiguity enforced.

**Proposed default template for NEW shops** (existing `jolly-enterprises` tiers untouched):

| # | Bracket (₹, half-open) | Notes |
|---|---|---|
| 1 | 1,000 – 10,000 | new low bracket (product requirement: ~₹1,000 start) |
| 2 | 10,000 – 20,000 | matches existing |
| 3 | 20,000 – 40,000 | matches existing |
| 4 | 40,000 – 50,000 | matches existing |
| 5 | 50,000 – 1,00,000 | matches existing |
| 6 | 1,00,000 – 1,50,000 | matches existing |
| 7 | 1,50,000 – 2,50,000 | matches existing |
| 8 | 2,50,000 – 5,00,000 | matches existing |
| 9 | 5,00,000 – 10,00,000 | new |
| 10 | 10,00,000 – 20,00,000 | new ("10–20 lakh") |
| 11 | 20,00,000 – open | new top bracket (highest approved range) |

`default_min_spin_amount = 1000` for new shops (existing store keeps 10000).
`max_gift_selections_per_bracket = 4` (platform-editable).

**Adopted (2026-10-15 execution order).** Boundary semantics made explicit:

- All amounts are whole rupees (integer), stored exactly as today.
- Brackets are **half-open `[min_amount, max_amount)`**; the top bracket has
  `max_amount IS NULL` and matches every amount `>= 2,000,000`.
- The 11 ranges are contiguous: every `min_amount` equals the previous `max_amount`
  (1,000 → 10,000 → 20,000 → 40,000 → 50,000 → 1,00,000 → 1,50,000 → 2,50,000 →
  5,00,000 → 10,00,000 → 20,00,000 → open). No gaps, no overlaps.
- The floor rule is unchanged: a submission qualifies only from
  `greatest(bracket.min_amount, store.min_spin_amount)` upward; with
  `default_min_spin_amount = 1000` the lowest bracket is fully reachable.
- Brackets 2–8 are boundary-identical to the existing production tiers (₹10,000–₹5,00,000);
  the old open-ended ₹5,00,000+ range is split into brackets 9–11 **for new shops only**.
- Maximum 4 selected gifts per bracket (platform-enforced, `platform_policies`).
- Equal probability among the bracket's valid selected gifts; no weighted odds.
- **The existing production shop's tiers, assignments, submissions and behaviour are not
  modified** to match this template.

## 7. Migration sequence (files, additive)

1. `20261015xxxxxx_platform_catalog_policies.sql` — `gift_catalog`, `platform_policies`
   (seeded), `store_owner_invitations`, `rewards.catalog_gift_id` + sync trigger, RLS,
   grants, audit triggers.
2. `20261015xxxxxx_tier_gift_options.sql` — `tier_gift_options` + FKs, integrity trigger,
   RLS, grants, audit trigger.
3. `20261015xxxxxx_reward_engine_multipool.sql` — replace `submit_customer_entry` (pool +
   uniform pick + fallback), add `save_store_gift_options`, `admin_save_store_tiers`,
   `create_shop`, `link_store_owner`; grants/revokes.

Ordering matters (1 → 2 → 3). Each file is re-runnable where practical (`if not exists` /
`create or replace`). Applied history is never rewritten.

## 8. Backup, restore and testing plan

**Production (before any production apply — separate approval):**
`pg_dump` via `supabase db dump --data-only` + schema dump against `jwellery` using the CLI's
hidden password prompt; verify the dump opens and contains protected rows (`dsklks` /
`GIFT-DDD89040`) before proceeding; store encrypted/offline. Restore drill documented.
(A planned command is not a backup — actual result will be reported.)

**Staging (after approval):** create `jriq-staging`, apply migrations, seed synthetic
tenants Shop A / Shop B with two owner accounts. Test matrix:

- Shop creation: happy path, duplicate slug (rejected/idempotent), retry idempotency,
  partial-failure recovery, invitation pending → link flow.
- Catalogue: platform CRUD, deactivation removes gift from all pools, vendor cannot write.
- Selection limits: 5th selection rejected, inactive gift rejected, cross-tenant tier rejected.
- Engine: boundary amounts (bracket edges), empty pool error, legacy fallback identical to
  old behaviour, uniform distribution over ≥ 1,000 draws per 3-gift pool (chi-squared or
  range check), identical retry replay, conflicting `request_id` rejection, concurrent
  submissions (two parallel calls), config change after assignment leaves saved reward intact.
- Collection: double collection rejected; collector identity/time recorded.
- Tenant isolation: A cannot read/mutate B's tiers, gifts, options, submissions; slug and
  payload tampering cannot bypass `is_store_admin`; ordinary owners rejected from
  platform RPCs; self-escalation impossible; anon can only `submit_customer_entry` and read
  active public rows.

## 9. Compatibility, risks and costs

- **Existing shop behaviour:** unchanged until a bracket is opted into multi-gift
  (fallback path). Claim `GIFT-DDD89040` and all snapshots untouched (additive DDL only).
- **Behaviour change (implemented per adopted plan):** bracket-boundary editing moves from
  shop owner to platform control; shop owners edit gift selections per bracket and their
  legacy reward rows. `save_store_tiers` remains available for existing owner workflows.
- **Wheel segments:** `save_store_tiers` keeps its one-gift-per-`target_segment` (0–7) rule
  for legacy tiers; on the admin path `target_segment` is a display hint. The wheel renders
  the resolved bracket's pool (legacy brackets: the single reward) and always lands on the
  saved label — the animation never selects a prize. The new template has 11 brackets vs 8
  wheel segments, which is precisely why segments stay display-only.
- **Frontend work:** vendor gift-selection UI, platform admin UI (`/platform/*`), minor
  wheel adaptation. `submit_customer_entry` return shape unchanged, so the customer flow
  needs no contract change.
- **Types:** `database.types.ts` will be regenerated after the schema changes.
- **Costs:** none — all of this fits Supabase free tier; no Pro, no branching, no new
  services. QR generation will use a small MIT-licensed npm package (Phase 5, to be added
  with the lockfile).
- **Risks:** moderate and mitigated — largest is engine regression; mitigated by fallback
  path + baseline test suite (161 tests) + the staging matrix above.

## 10. Rollback / forward recovery

- Staging: re-run previous app build; schema additions are inert without the new app paths.
  Forward recovery preferred in production: deactivating all `tier_gift_options` rows for a
  bracket instantly restores legacy single-gift behaviour (no DDL rollback needed).
- RPC replacement rollback: the previous `submit_customer_entry` definition is preserved in
  the migration file comments and in git; restoring it is a single `create or replace`.
- No destructive statements exist in any proposed file.

---

**Approval requested:** approve this proposal (optionally with answers to the §6 question and
the §9 bracket-editing preference) so it can be applied to `jriq-staging` first. Production
application remains a later, separately approved step.
