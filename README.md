# Managed jewellery rewards

This is one shared React application for branded jewellery campaigns. The
legacy `/store/jolly-enterprises` route is a technical campaign URL only; it is
not used as the store's confirmed display name. The supplied artwork is retained
and the default text label is neutral until the owner confirms the display name.

## Local development

```sh
npm install
npm run dev
npm test
npm run build
```

With no Supabase environment values, the app uses local browser storage for the
existing customer-flow demo. That mode is not authentication, durable storage,
or a secure multi-tenant deployment.

## Supabase setup required for a hosted product

1. Create a Supabase project and configure `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` in the Vercel project. The anon key is public; never
   put a service-role key in a `VITE_` variable or browser bundle.
2. Apply the checked-in SQL migrations in filename order:
   [`20261010202900_initial_schema.sql`](./supabase/migrations/20261010202900_initial_schema.sql)
   followed by
   [`20261010203000_managed_tenant_foundation.sql`](./supabase/migrations/20261010203000_managed_tenant_foundation.sql).
   Review and test them against a non-production Supabase project before using
   them with live customer data.
3. Create the first platform administrator from a trusted server/SQL session by
   inserting its Supabase Auth user ID into `public.platform_admins`. The
   browser cannot grant itself this role.
4. Create store users and `store_admins` memberships only through a trusted
   onboarding process. Never expose Supabase service-role credentials to the
   browser.
5. Set each store's confirmed display name, branding, review URL, reward labels,
   and tiers in that tenant's records. The review URL is store-specific; no
   global Google review link or prewritten review is used.

The migration enables row-level security on tenant data. The public customer
flow can read only active campaign configuration. It cannot insert or edit
submission rows directly: `submit_customer_entry` resolves the tenant by its
public campaign slug, validates the customer details and amount, selects the
unique active tier/reward in PostgreSQL, snapshots the award, and uses a
client-generated request UUID for safe retries. Collection changes are made
through `mark_submission_collected`, which checks the authenticated user's
tenant membership and refuses duplicate claims.

`platform_admins`, configurable subscription plans, per-store subscription
records, and audit-log tables are created by the migration. Automated recurring
payments are not implemented. Initial admin bootstrapping, store/user
provisioning, plans, and subscription changes still require trusted database
operations; this repository does not yet contain the requested central
platform-owner onboarding and subscription-management UI or invitation
service. Do not treat the existing `/admin` page as that internal console.

## Data and privacy notes

- Campaign URLs include only a public store slug, never customer data.
- Public confirmation masks the customer's phone number.
- Customer records remain available in storage when subscription access expires.
- Production retention, deletion/export requests, and operating procedures must
  be configured before collecting live customer data.
- Google reviews are optional. The customer opens the store's configured
  Google URL directly, writes their own review on Google if they choose, or
  skips the step. The app does not draft, submit, or require reviews.

## Deployment status

Vercel is configured for SPA fallback routing in `vercel.json`. Production
deployment is not verified by this repository change. A real Supabase project,
applied migration, configured Auth users/RLS, and deployed app are required
before describing the application as production-ready.
