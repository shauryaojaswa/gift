# Setup guide

## What runs

Three compose services (`docker-compose.base44.yml`):

| Service | Image | Purpose |
|---|---|---|
| `db` | `postgres:16-alpine` | Database, with a named volume for persistence. |
| `api` | `node:22` | Express API. Migrates and seeds on start, then runs with `node --watch`. |
| `web` | `node:22` | Vite dev server on port 3000, proxying `/api` to `api`. |

Source is bind-mounted into both app services, so edits reload live.

## First run

```sh
docker compose -f docker-compose.base44.yml up -d --build
curl -s http://localhost:3000/api/health     # {"ok":true}
```

The API's start command is:

```
npm install && node src/seed.js && node --watch src/server.js
```

`seed.js` runs migrations, then idempotently creates the platform admin, the
demo owner and the demo store with its default rewards and tiers.

## Migrations

SQL files live in `backend/db/migrations/` and are applied in filename order.
Applied files are recorded in `schema_migrations`, so re-running is safe.

Add a migration by creating the next numbered file, then:

```sh
docker compose -f docker-compose.base44.yml exec api node src/migrate.js
```

`001_schema.sql` creates the tables; `002_seed_plans.sql` inserts the default
plans. Both use `if not exists` / `on conflict do nothing` so they are safe to
re-apply.

## Running the API outside Docker

```sh
cd backend
npm install
DATABASE_URL=postgres://gift:gift@localhost:5432/gift \
JWT_SECRET=dev-only-change-me \
npm run dev
```

Then run the frontend with `VITE_API_PROXY_TARGET=http://localhost:4000 npm run dev`.

## Testing

```sh
# Backend: reward boundaries, tier validation, claim codes, field validation
docker compose -f docker-compose.base44.yml exec api npm test

# Frontend: wheel maths, reward engine, currency, validation, components
docker compose -f docker-compose.base44.yml exec web npx vitest run

# Type check
docker compose -f docker-compose.base44.yml exec web npx tsc -b
```

## Resetting the local database

```sh
docker compose -f docker-compose.base44.yml down
docker volume rm app_db_data
docker compose -f docker-compose.base44.yml up -d --build
```

This destroys all local data. Never do this against a deployed environment.
