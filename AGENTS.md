# AGENTS.md — Base44 setup notes

## Project

Multi-tenant "Spin & Win" rewards SaaS for jewellery shops.
Vite 8 + React 19 + TypeScript + Tailwind frontend, Node 22 + Express API,
PostgreSQL 16. Not a static site.

## Running

```sh
docker compose -f docker-compose.base44.yml up -d --build
```

Three services: `db` (postgres), `api` (port 4000), `web` (Vite on port 3000).
The web dev server proxies `/api` to `api`, so sessions are single-origin and
cookies work. The API migrates and seeds on boot via `node src/seed.js`.

- Frontend source is bind-mounted at `/app`; backend source at `/app` in the api
  container. Both use `npm install` on start (the lockfile is not in sync with
  package.json, so `npm ci` fails).
- `JWT_SECRET` is required and is delivered through `/run/base44/app.env`.
- Razorpay vars (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`) are optional: the app boots without them and
  `POST /api/owner/stores/:storeId/subscription/checkout` returns a clear 503
  "Payments are not configured yet." (`testMode: true`) instead of charging.
  The subscription view reports `providerConfigured: false`.

## Layout

```
backend/               Express API
  db/migrations/       versioned SQL, applied in filename order
  src/routes/          auth, public, owner, admin, billing
  src/reward-engine.js deterministic tier resolution + tier validation
  test/                node:test suites (no DB required)
src/                   React app
  features/dashboard/  owner dashboard (Overview, Customers, Gifts, QR, Settings, Billing)
  features/platform-admin/
  features/onboarding/ setup wizard
  lib/api.ts           typed API client (all SaaS calls go through this)
  lib/data/api.ts      DataProvider adapter used by the customer campaign
docs/                  setup, dashboard, subscriptions, security, deployment
```

## Gotchas

- The customer campaign reads its config from `GET /api/public/stores/:slug` via
  `ApiDataProvider.getStoreConfig`. It returns `campaignActive: false` when the
  subscription has lapsed; `CustomerFlow` renders a "campaign paused" card rather
  than a blank page.
- Rewards carry both `name` (full reward, shown on the reveal page) and
  `wheelLabel` (short label, shown in the wheel sector). `buildSegments` uses
  `wheelLabel ?? name`.
- Tier `max_amount` is **exclusive**: ₹10,000–₹19,999 is `10000`–`20000`.
- `src/features/admin/` is the superseded single-tenant admin. It is no longer
  routed; `/admin/*` redirects to `/dashboard`.
- `#root:has(.saas-root)` removes the customer-flow centering for SaaS surfaces.

## Testing

```sh
docker compose -f docker-compose.base44.yml exec api npm test
docker compose -f docker-compose.base44.yml exec web npx vitest run
docker compose -f docker-compose.base44.yml exec web npx tsc -b
```

Backend tests cover tier boundaries, tier validation, claim codes and field
validation. They do not touch the database.

## Verifying end to end

Sign in with the seeded accounts (see README). Tenant isolation is enforced by
`requireStoreMember` on every `/api/owner/stores/:storeId/*` route — check with
two owners and a direct API call, not just the UI.
