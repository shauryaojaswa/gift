# Security and data handling

## Tenancy model

Every store-owned row carries a `store_id`. Access is decided by a row in
`store_members` (user ↔ store ↔ role), never by anything the browser sends.

| Table | Tenant-scoped |
|---|---|
| `stores` | root |
| `store_members` | yes |
| `rewards`, `reward_tiers` | yes |
| `submissions` | yes |
| `subscriptions`, `usage_counters` | yes |
| `billing_events` | yes (nullable during webhook processing) |

## Where isolation is enforced

**In the API, on every request.** `requireStoreMember` resolves the caller's
membership for the `:storeId` in the URL before any handler runs. Mutations
additionally require `requireStoreOwner`. There is no route that accepts a store
id from the request body and trusts it.

Verified behaviour (see the project history for the exact commands):

| Attempt | Result |
|---|---|
| Anonymous `GET /api/owner/stores` | `401` |
| Store B owner reading Store A's submissions | `403` |
| Store B owner reading Store A's stats | `403` |
| Store B owner patching Store A's store | `403` |
| Store B owner deleting Store A's reward | `403` |
| Store A owner reading Store B's submissions | `403` |
| Store B owner reading their own submissions | `200` |
| Store owner calling `/api/admin/metrics` | `403` |

## Server-authoritative reward assignment

`POST /api/public/stores/:slug/submissions` accepts only **name, purchase amount
and phone number**. The server then:

1. Validates the store exists and its account is active.
2. Checks campaign access from the subscription state.
3. Validates the purchase amount against the store's minimum.
4. Resolves the single active tier containing that amount.
5. Reads the reward from the database (never from the request).
6. Writes the submission with an immutable snapshot and a claim code.
7. Returns only what the customer experience needs.

A browser cannot submit a reward id, reward name, voucher value or tier id.
`Math.random()` is never used to pick a reward.

## Historical integrity

Each submission stores its own copy of the reward name, description, voucher
amount and validity at the moment it was created. Editing a gift later does not
rewrite what a past customer won — verified by renaming a gift and re-reading an
existing submission.

## Authentication

- Passwords are hashed with bcrypt (cost 10).
- Sessions are JWTs in an `httpOnly`, `SameSite=Lax` cookie, `Secure` in
  production. The browser cannot read or edit them.
- Platform-admin access is a row in `platform_admins`, checked server-side on
  every admin request. Changing a URL or React state does not grant access.
- The `RequirePlatformAdmin` guard in the frontend is a convenience only; the
  server enforces the real check.

## Abuse protection

- The public submission endpoint is rate limited to 20 requests per minute per
  IP and store slug.
- Monthly plan limits are enforced in the database, but never in a way that
  blocks a store from reading its existing data.
- Body size is capped at 1 MB.

## Privacy

- Collected fields: full name, purchase amount, phone number. No email,
  address, date of birth or survey.
- Purpose is limited to operating the reward campaign.
- Customer records are never shared between tenants and never reused across
  stores.
- Phone numbers are masked on the public thank-you screen (`******0001`) and are
  never placed in QR codes or public URLs.
- Marketing consent is never assumed.
- Customers can request deletion by contacting the store; owners can request
  deletion of their store and data.

## Logging

The API logs a message only, never request bodies or customer records:

```js
console.error('[api]', error.message)
```

Errors returned to clients are generic; internal details are not exposed.

## Secrets

Secrets are read from the environment and are never committed. The `.gitignore`
excludes `.env*` except `.env.example`. Only `VITE_`-prefixed values reach the
browser, and no secret uses that prefix.

## If you deploy on Supabase instead

The API enforces tenancy in code. If you later expose Postgres directly (for
example through Supabase PostgREST), you must add Row Level Security policies on
`stores`, `store_members`, `rewards`, `reward_tiers`, `submissions`,
`subscriptions` and `usage_counters`, keyed on a membership lookup for the
authenticated user. Those policies are **not** provided or tested here, because
this deployment does not expose the database directly.
