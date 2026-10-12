# Spin & Win Rewards — multi-tenant jewellery SaaS

A multi-tenant SaaS that turns a jewellery shop's billing counter into a QR-based
reward experience. Customers scan a code, enter three details, spin a wheel and
collect a gift. Shop owners manage gifts, tiers, QR codes, customers and their
subscription from a dashboard. A separate platform-admin area manages shops,
plans and subscriptions.

## Architecture

```
browser ──▶ Vite dev server (port 3000)
                │  proxies /api  (single origin, so session cookies work)
                ▼
            Node + Express API (port 4000)
                │
                ▼
            PostgreSQL 16
```

- **Frontend** — Vite 8 + React 19 + TypeScript + Tailwind. Customer campaign,
  owner dashboard, platform admin, marketing and legal pages.
- **Backend** — `backend/` Node 22 + Express. Authentication, tenant-scoped
  store data, deterministic reward assignment, subscriptions and webhooks.
- **Database** — PostgreSQL with versioned migrations in `backend/db/migrations/`.

The customer campaign UI, wheel animation and Google-review helper are the
original components, preserved. Only their data source changed.

## Quick start (sandbox / local)

```sh
docker compose -f docker-compose.base44.yml up -d --build
```

The API applies migrations and seeds on boot. Then open:

| URL | What it is |
|---|---|
| `/` | Marketing landing page |
| `/pricing` | Live pricing from the database |
| `/register`, `/login` | Shop-owner accounts |
| `/dashboard` | Owner dashboard |
| `/platform-admin` | Platform operator area |
| `/store/jewellers-demo` | The public customer campaign |
| `/standee/jewellers-demo` | Print-friendly counter standee |

### Seeded development accounts

Created by `backend/src/seed.js` from environment variables (defaults shown).
**Change these before any real deployment.**

| Role | Email | Password |
|---|---|---|
| Platform admin | `admin@gift.local` | `admin12345` |
| Demo store owner | `owner@demo.local` | `demo12345` |

The demo store's display name is intentionally blank — the owner sets it in
**Store Settings**. The supplied jewellery logo is the visual source of truth.

## Tests

```sh
docker compose -f docker-compose.base44.yml exec api npm test    # reward engine + validation
docker compose -f docker-compose.base44.yml exec web npx vitest run
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — environment variables and running locally
- [docs/DASHBOARD.md](docs/DASHBOARD.md) — the shop-owner dashboard guide
- [docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md) — plans, billing and Razorpay setup
- [docs/SECURITY.md](docs/SECURITY.md) — tenancy model, privacy and data handling
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production hosting and configuration

## Status

Built and verified in this environment: customer campaign end-to-end, owner
dashboard, platform admin, tenant isolation, tier boundaries, snapshot
integrity, collection tracking and subscription-gated access. The Razorpay
integration is implemented but has **not** been exercised against live
credentials — see [docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md).
