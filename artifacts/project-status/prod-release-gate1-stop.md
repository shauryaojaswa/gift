# Production release Gate 1 — STOP report (invoice-details / v1.3.1 ship attempt)

**Date:** 2026-10-18 (IST)
**Target:** production `awshkiwqkuubkhecszzk` (jwellery / jriq.in)
**Verdict:** **GATE 1 FAILED — STOPPED before production. Nothing was applied, deployed, tagged, or backed up.**
**Labels used:** VERIFIED / REPORTED / INFERRED / BLOCKED.

---

## 1. Why the gate failed

Not a defect in the invoice migration itself — the migration is correct **against the repo's current
schema state**. The failure is a **schema-version gap between production and the repo migration
chain**: production is two migrations behind the code the migration was written from.

The invoice migration (`supabase/migrations/20261018120000_invoice_details.sql`) replaces
`submit_customer_entry` with a body that is verbatim from `20261017150000_gift_price_policy_and_stock.sql`
plus the invoice argument. That body references `tier_gift_options.quantity`,
`quantity_claimed`, and `declared_value` — columns that **do not exist on production**.

---

## 2. Evidence (all read-only probes against production, 2026-10-18)

### 2.1 Recorded migration history — 11 rows, ends at `20261016130000`
(`logs/v1.3.1/prod-migration-history.log`)

| Recorded on prod | Migration |
|---|---|
| ✅ | `20261010202900` initial_schema … through `20261016130000` public_gift_pool_read (11 rows) |
| ❌ **not recorded** | `20261016200000` wheel_label_bundle_width |
| ❌ **not recorded** | `20261017120000` store_logo_rls_fix |
| ❌ **not applied** | `20261017150000` gift_price_policy_and_stock |
| ❌ **not applied** | `20261017150100` shop_config_management |
| ❌ **not applied** | `20261018120000` invoice_details (this release) |

### 2.2 Object state on production (VERIFIED)

| Object | State on prod | Source |
|---|---|---|
| `tier_gift_options` columns | `id, store_id, tier_id, reward_id, active, created_at, updated_at` — **no `quantity`, `quantity_claimed`, `declared_value`** | `logs/v1.3.1/prod-tgo-cols.log` |
| `gift_catalog` columns | full (incl. `wheel_label`, `active`, `voucher_value`, `claim_code_prefix`, `validity_text`) | `logs/v1.3.1/prod-gc-cols.log` |
| `public.collections` | **absent** (`to_regclass` → null) | `logs/v1.3.1/prod-objects-2.log` |
| `public.shop_config` | **absent** (`to_regclass` → null) | `logs/v1.3.1/prod-objects-2.log` |
| `submit_customer_entry` | **7-arg** (`…, p_review_cta_clicked boolean`) — no invoice arg | `logs/v1.3.1/prod-objects-probe.log` |
| `save_store_gift_options` | **2-arg** (`p_tier_id, p_catalog_gift_ids`) — pre-20261017150000 | `logs/v1.3.1/prod-objects-probe.log` |
| `get_store_gift_pool`, `is_store_campaign_active`, `set_store_status` | present | `logs/v1.3.1/prod-objects-probe.log` |
| prod `submit_customer_entry` body lineage | `has_stock_logic=false`, `has_gift_catalog=true`, `has_declared_value=false`, `has_invoice=false` → the 20261015161200 multipool version | `logs/v1.3.1/prod-function-lineage.log` |

### 2.3 Applied-but-unrecorded migrations (history hygiene gap)

- `20261016200000` **is applied**: `rewards_wheel_label_length` + `gift_catalog_wheel_label_length`
  CHECK constraints present (`logs/v1.3.1/prod-wheel-constraint.log`) — but absent from
  `supabase_migrations.schema_migrations`.
- `20261017120000` **is applied**: the three store-logo storage policies
  ("Public can view store logos", "Store users can upload/update own logo")
  (`logs/v1.3.1/prod-storage-policies.log`) — but absent from history.

### 2.4 The migration's risky references (would break on prod)

`supabase/migrations/20261018120000_invoice_details.sql`:

| Line | Reference | Exists on prod? |
|---|---|---|
| 196, 224, 245, 314 | `o.quantity`, `o.quantity_claimed` on `tier_gift_options` | **NO** |
| 274 | `o2.declared_value` | **NO** |
| 312 | `set quantity_claimed = …` (UPDATE target column) | **NO** |
| 114, 194, 222, 243 | `is_store_campaign_active`, `gift_catalog` | yes |

---

## 3. Failure mode if the migration were applied as-is (why this is High severity)

1. **Silent apply, runtime outage.** PostgreSQL does not validate plpgsql column references at
   `CREATE FUNCTION` time — the `DROP` + `CREATE` would commit successfully. The **first customer
   submission after deploy** would then error (`column o.quantity does not exist`), and the old
   7-arg function is gone (dropped in the same migration) — **customer flow outage on production**.
   (INFERRED from PG behaviour + VERIFIED absence of columns — high confidence.)
2. **Bundle/RPC mismatch.** The v1.3.1 bundle (current tree, which includes the Kohinoor-era code)
   calls the 4-arg `save_store_gift_options`; on prod only the 2-arg exists → PostgREST 404 in the
   platform gift-pool management panel.

---

## 4. Remediation options (decision required — nothing executed)

**Option A — ship the full chain (recommended).**
Apply, in order and in one maintenance window, all as the same additive class used in v1.1.0/v1.3.0
(columns + function supersets, no destructive SQL):
1. `20261017150000_gift_price_policy_and_stock.sql`
2. `20261017150100_shop_config_management.sql`
3. `20261018120000_invoice_details.sql`
4. History backfill rows for `20261016200000` + `20261017120000` (already applied; record them so
   `supabase_migrations.schema_migrations` matches reality).
Then proceed with the sequence as approved (backup → migrate → deploy → verify → tag).

⚠️ **Sign-off explicitly needed:** step 1 imports the **gift price-policy + stock reward semantics**
(effective declared value, exhausted-pool exclusion, `quantity_claimed` tracking) into the live
reward engine for existing production stores. Kohinoor *store provisioning* stays deferred (no shop
rows seeded) — but the engine behaviour change itself is live from the moment the function is
replaced. This is a genuine reward-engine delta on live tenants and must be an explicit yes.

**Option B — invoice-only rescope.**
Rewrite `20261018120000` to extend **prod's current 7-arg body** (20261015161200 lineage) with only
`p_invoice_details`, and deploy. Customer flow + vendor invoice display work; but production then
stays divergent from the tree: the platform gift-pool panel keeps 404-ing on its missing RPCs until
`20261017*` is approved separately, and the Kohinoor feature remains staging-only.

---

## 5. What was NOT done (per the gate)

- ❌ No production migration applied (no DDL/DML executed against `awshkiwqkuubkhecszzk` beyond
  read-only `SELECT`s; PII-free probes only).
- ❌ No backup taken (sequence step 2 was not reached — gate 1 comes first).
- ❌ No deploys (MilesWeb root and GitHub Pages untouched — both still serve the pre-feature build).
- ❌ No tag, no commits, no pushes.
- ✅ Staging remains correct: the full chain incl. invoice-details is applied there and previously
  verified 9/9 + 7/7 with persistence, tenant isolation, and rate-limit checks.

## 6. Requested decision

Reply with **Option A** (with the reward-engine sign-off) or **Option B** (invoice-only rescope).
Execution resumes at the top of the approved sequence on your word.
