# Gift — Managed White-Label Jewellery Spin & Win SaaS

A managed, white-label **Spin & Win** customer-rewards campaign platform for
jewellery shops. We operate the platform internally: each shop gets its own
branded customer campaign (logo, colours, rewards, public URL, QR code) and a
private dashboard for its own customer records.

Three separate experiences live in this codebase:

| Experience | Route | Audience |
|---|---|---|
| Public customer campaign | `/store/:slug` | Shoppers (no login) |
| Client dashboard | `/admin` | One shop's authorised users |
| Print standee / QR | `/standee/:slug` | In-store printout |

## Stack

- **React 19 + TypeScript + Vite 8** SPA (no separate API server)
- **Dual data layer** — auto-selected at runtime:
  - `LocalDataProvider` (browser localStorage) — zero-config dev/demo mode
  - `SupabaseDataProvider` (PostgreSQL + Supabase Auth + Row Level Security) —
    used when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
- **Tailwind CSS** with a premium burgundy / gold / ivory jewellery theme
- **Vitest + Testing Library** for unit/integration tests
- **Playwright** for end-to-end visual QA (`scripts/e2e-qa.mjs`)
- Deployed as a static build on **Vercel** (`vercel.json` rewrites all routes
  to `index.html` so deep links survive refresh)

## Quick start

```bash
npm install
npm run dev        # Vite dev server (default :5173)
npm run build      # tsc -b && vite build -> dist/
npm run preview    # serve the production build locally
npm test           # vitest run (114 tests)
npm run lint       # oxlint
```

## Environment variables

Copy `.env.example` to `.env` and fill in what you need. All variables are
optional — the app boots without any of them.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL. Enables the Supabase data layer. |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key. **Never** commit service-role keys. |
| `VITE_GOOGLE_REVIEW_URL` | Overrides the store's Google review URL everywhere. |

Without Supabase variables the app runs entirely on localStorage (demo mode
with the built-in `jolly-enterprises` store).

## Database migrations (Supabase)

Version-controlled SQL migrations live in `supabase/migrations/`:

- `0001_add_gift_collection_tracking.sql` — adds `collection_status`
  (`awaiting` / `collected`), `collected_at`, `collected_by`, a CHECK
  constraint, a `(store_id, collection_status)` index and a safe backfill.
  The migration is additive and idempotent — it never drops or rewrites data.

Apply with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

…or paste the file's contents into **Supabase Studio → SQL Editor**. Re-running
it is safe.

> **Note for the existing production database:** run migration 0001 before
> deploying a build that includes gift-collection tracking. Older builds keep
> working either way because the column defaults to `awaiting`.
> **Note for the existing production database:** run migration 0001 before
> deploying a build that includes gift-collection tracking. Older builds keep
> working either way because the column defaults to `awaiting`.

## Customer journey

`QR scan → Welcome → Details → Optional Google review → Spin → Reward reveal → Gift collection page → Reset`

- Only three required fields: **full name**, **purchase amount** (Indian
  grouping, e.g. `₹10,00,000`), **10-digit Indian mobile** (last field).
- The reward is **deterministic**: purchase amount → active tier → assigned
  reward → target wheel segment. The browser never invents the reward — the
  engine validates the amount against the store's configured tiers, and a
  snapshot of the reward is saved with the submission so later configuration
  changes never rewrite history.
- The wheel is a real SVG rotor animated with `requestAnimationFrame`; it
  rotates several turns over ~4–6 s and mathematically lands inside the
  assigned segment. One spin per submission — double clicks are ignored.
- The final page tells the customer to show the screen at the counter; staff
  mark the gift **Collected** in the dashboard (timestamp + staff identity).

## Google review policy

- The review step opens **Google's real review-composer URL** in a new tab.
  Nothing is prefilled, generated, or submitted on the customer's behalf —
  the app never fabricates reviews or ratings.
- Reviewing is fully optional (`SKIP & SPIN`), the reward never changes, and
  returning to the tab keeps the session intact (return detection only; it
  does not verify publication).
- Resolution order: `VITE_GOOGLE_REVIEW_URL` → the store's
  **Store Settings → Google Review URL** → built-in default. URLs must be
  HTTPS Google domains.

## Testing & visual QA

```bash
npm test                     # unit + integration (vitest)
npm run lint                 # oxlint
npm run build                # typecheck + production build

# End-to-end visual QA (needs the preview server running):
npm run preview              # terminal 1 — serves dist/ on :4173
node scripts/e2e-qa.mjs http://localhost:4173   # terminal 2
```

The E2E script walks the real journey in headless Chromium: it verifies the
welcome/details/validation/review steps, hit-tests the SPIN button, proves the
wheel transform actually changes, checks all eight wheel labels for overlap,
confirms the reward reveal, resets, opens Google and returns, then sweeps
**320×700 → 430×932** capturing screenshots (into `qa-shots/`) and checking
horizontal overflow and console errors. Exit code 1 means failures.

## Deployment (Vercel)

- **Build command:** `npm run build` — **Output:** `dist/`
- `vercel.json` rewrites every path to `/index.html` so `/store/:slug`,
  `/admin` and `/standee/:slug` work directly and survive refreshes.
- Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and (optionally)
  `VITE_GOOGLE_REVIEW_URL` in **Project Settings → Environment Variables**,
  then redeploy — Vite inlines them at build time.
- The QR code points at `${window.location.origin}/store/<slug>`, so it always
  resolves to the production origin it is generated from.
- **Payments:** there is no payment/checkout code in this codebase. Razorpay
  (or any provider) is **not integrated**; subscription billing is a planned
  milestone and must not be presented as functional until a provider is
  configured, server-verified and tested.


