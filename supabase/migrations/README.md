# Supabase migrations

Canonical apply order (filename order; each is idempotent and additive):

| Order | File | Purpose |
|---|---|---|
| 1 | `20261010202900_initial_schema.sql` | Core tables: `stores`, `rewards`, `reward_tiers`, `submissions`, `store_admins` |
| 2 | `20261010203000_managed_tenant_foundation.sql` | Collection tracking columns (`collection_status`, `collected_at`, `collected_by uuid`), `request_id`, tier/reward extensions, rate limiting, `platform_admins`, subscriptions, RLS policies, `storage` bucket + policies, and the RPCs `submit_customer_entry`, `mark_submission_collected`, `save_store_tiers` |
| 3 | `20261010203100_submissions_collection_index.sql` | `(store_id, collection_status)` index for dashboard "awaiting collection" counts |

Later additive migrations (same apply discipline - filename order, idempotent):

| Order | File | Purpose |
|---|---|---|
| 4 | `20261019120000_store_gift_columns.sql` | Per-store eight-field gift editor: `stores.gift_columns`, `save_store_gift_columns`, gift-pool-tolerant `submit_customer_entry` |
| 5 | `20261019150000_admin_login_id.sql` | Shop name as admin login ID: `store_admins.login_id` + backend resolution RPC `resolve_admin_login` (Supabase Auth stays the only credential store) |
| 6 | `20261019150100_store_spin_duration.sql` | Per-store wheel animation duration `stores.spin_duration_ms` (NULL = shared 5000ms default; BCY = 6000ms) |
| 7 | `20261019170000_store_location_label.sql` | Branch label for the shop-owner admin `stores.location_label` (NULL = no label; admin-facing only, the customer strapline stays in `stores.subtitle`) |

Kohinoor chain (applied to production 2026-10-24, see
`artifacts/project-status/kohinoor-golive-20261024.md`):

| Order | File | Purpose |
|---|---|---|
| 2b | `20261017150000_gift_price_policy_and_stock.sql` | Platform price policy (`gift_catalog.value_min/value_max/excluded_store_ids`), per-bracket declared values + quantities, 4-arg `save_store_gift_options` (2-arg shape kept callable), pool-tolerant draw |
| 2c | `20261017150100_shop_config_management.sql` | Shop-config RPCs: `create_shop` (tiers jsonb), `rename_store_slug`, `set_store_review_policy`, review-link guard |

## Reconciliation record (2026-10-14)

`0001_add_gift_collection_tracking.sql` was removed (superseded by migration 2):

- It sorted **before** migration 1, so an ordered apply failed on a table that
  did not yet exist.
- Its columns duplicated migration 2's with an incompatible
  `collected_by text` type, which would have blocked
  `mark_submission_collected` (`auth.uid()` is `uuid`).

Its one unique artifact — the `(store_id, collection_status)` index — is
preserved in migration 3. No other semantics were changed.

## Apply

```bash
# with the Supabase CLI (needs `supabase link` + a service-role-free access token):
supabase db push

# or paste the three files, in order, into the Supabase SQL Editor.
```

## New-table grant discipline (audit SEC-10)

Supabase grants `anon`/`authenticated` full DML on tables it creates by default, and
`ALTER TABLE ... ADD COLUMN` does not change existing grants. Any migration that
**creates** a table must therefore state its grants explicitly, in the same file:

```sql
revoke all on table public.<new_table> from anon, authenticated;
grant select on table public.<new_table> to anon;      -- only if it is a public read
-- authenticated access comes from the table's own RLS policies
```

Read-only customer-page tables (`stores`, `rewards`, `reward_tiers`) are intentionally
public; tenant data (`submissions`, `store_admins`, platform tables) is not.

Then seed a store: `../seed_jolly_enterprises.sql` (creates the
`jolly-enterprises` store, its rewards and reward tiers).

## Status

**No migration has been applied to any Supabase project yet** — no project is
configured in this repository. Nothing in this directory should be read as
applied; apply status must be verified in the target project before claiming it.
