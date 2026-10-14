# Supabase migrations

Canonical apply order (filename order; each is idempotent and additive):

| Order | File | Purpose |
|---|---|---|
| 1 | `20261010202900_initial_schema.sql` | Core tables: `stores`, `rewards`, `reward_tiers`, `submissions`, `store_admins` |
| 2 | `20261010203000_managed_tenant_foundation.sql` | Collection tracking columns (`collection_status`, `collected_at`, `collected_by uuid`), `request_id`, tier/reward extensions, rate limiting, `platform_admins`, subscriptions, RLS policies, `storage` bucket + policies, and the RPCs `submit_customer_entry`, `mark_submission_collected`, `save_store_tiers` |
| 3 | `20261010203100_submissions_collection_index.sql` | `(store_id, collection_status)` index for dashboard "awaiting collection" counts |

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

Then seed a store: `../seed_jolly_enterprises.sql` (creates the
`jolly-enterprises` store, its rewards and reward tiers).

## Status

**No migration has been applied to any Supabase project yet** — no project is
configured in this repository. Nothing in this directory should be read as
applied; apply status must be verified in the target project before claiming it.
