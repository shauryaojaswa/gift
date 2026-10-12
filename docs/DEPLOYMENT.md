# Deployment guide

## What has to be hosted

The application is no longer a static site — it has three parts:

1. **PostgreSQL database**
2. **Node API** (`backend/`) — a long-running process
3. **Frontend build** — static files from `vite build`

`vercel.json` in the repository only configures SPA rewrites for the frontend.
Vercel's serverless functions are not a drop-in host for this Express API, and
Vercel's hobby terms do not permit commercial use. Pick a host whose plan allows
commercial workloads.

## Suggested topology

| Part | Suitable options |
|---|---|
| Database | A managed PostgreSQL instance (Neon, Supabase, RDS, Render Postgres). |
| API | A container host: Render, Railway, Fly.io, or any Docker host. |
| Frontend | Vercel, Netlify, Cloudflare Pages, or the same container host. |

## Environment variables to set

On the API host:

```
DATABASE_URL=postgres://…            # managed database
JWT_SECRET=<long random value>
NODE_ENV=production
PORT=4000
PLATFORM_ADMIN_EMAIL=…               # first-boot seed
PLATFORM_ADMIN_PASSWORD=…            # change immediately
RAZORPAY_KEY_ID=…                    # when payments go live
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…
RAZORPAY_PLAN_STARTER=…
RAZORPAY_PLAN_GROWTH=…
RAZORPAY_PLAN_MULTI_STORE=…
```

On the frontend host, set `VITE_API_PROXY_TARGET` **only for local development**.
In production the frontend must reach the API over the same origin (put both
behind one reverse proxy and proxy `/api` to the API service) or the session
cookie will not be sent. Recommended: serve the built frontend and proxy `/api`
from the same domain.

## Steps

1. Create the managed database and copy its connection string.
2. Deploy the API container. On first boot it applies migrations and runs the
   seed. Confirm `GET /api/health` returns `{"ok":true}`.
3. Change the seeded platform-admin and demo passwords immediately, or set
   `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` before the first boot.
4. Build the frontend (`npm ci && npm run build`) and deploy `dist/`.
5. Configure the reverse proxy so `/api/*` reaches the API and everything else
   serves the SPA (so `/dashboard`, `/store/:slug` etc. work on refresh).
6. Enable HTTPS. Cookies are marked `Secure` when `NODE_ENV=production`.
7. Open `/login`, sign in, and confirm the dashboard and a public campaign URL
   both load.

## QR codes

QR codes encode `window.location.origin + '/store/' + slug` at the moment they
are generated, so they always point at the domain the owner is using. Generate
them from the production domain — never from `localhost`.

## Database migrations in production

Migrations run automatically when the API starts and are idempotent. To run them
manually:

```sh
node src/migrate.js
```

Take a database backup before deploying schema changes.

## Not done here

No domain was purchased and nothing was deployed to production from this
environment. The steps above are the intended path; they have not been executed
against a live host.
