# Vendor Dashboard — How to Log In & Set Up

Verified live: **2026-10-13** — customer journey, Google Review flow, all vendor routes, vendor login, and local preview all working at the URLs below.

The shop‑owner dashboard lives at **`/vendor/login`**. There are **two ways** to use it:

- **A. Local preview (right now, no backend)** — explore the dashboard on your own machine during development.
- **B. Production (real, shared data)** — requires a Supabase project and one invited account. This is the only way the *deployed* site can be logged into.

> **Why you can't log into the live site yet:** the public deployment is running in
> **localStorage demo mode** (no `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`), so it has no
> accounts and no shared database. Sign‑in is deliberately refused there instead of faking it.

---

## A. Local preview (fastest — works today)

This path is **dev‑server only**. It is never compiled into the production build and ships **no
password**, so it cannot weaken the live site.

```bash
# from the project root
npm install
npm run dev
```

1. Open the printed URL, e.g. `http://localhost:5173/vendor/login`.
2. Enter **any email** (the password field can be left blank).
3. Click **Sign in** → you land on `/vendor/dashboard`.

You'll see the real UI: overview stats, customer list, "mark collected", rewards & tiers (with
overlap validation), QR code, and store settings. Data is stored in your browser's `localStorage`
for the single demo store, so it's a faithful preview of the screens and interactions — but it is
**per‑browser only** and clearly labelled with an amber "persistent storage not configured" banner.

To reset the local preview session: on the dashboard use **Sign out**, or run
`localStorage.clear()` in the browser console.

---

## B. Production (real vendor login + shared database)

You need a Supabase project (free tier is fine). Never commit keys — set them in the host's
environment variables.

### 1. Create / open your Supabase project
Note two values from **Project Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public key** → `VITE_SUPABASE_ANON_KEY`  (this is the safe, browser key — **never** the
  `service_role` secret key)

### 2. Create the schema & seed the demo store
In **SQL Editor**, create the tables the app expects: `stores`, `rewards`, `reward_tiers`,
`submissions`, `store_admins` (see `src/lib/database.types.ts` for the exact columns). Seed the
`jolly-enterprises` store (`id = 'store_1'`) with its rewards and reward tiers, matching
`src/lib/stores.ts`.

### 3. Apply the migrations (in order)
Run the SQL files in `supabase/migrations/` (names sorted ascending; see
`supabase/migrations/README.md` for the full inventory):
- `20261010202900_initial_schema.sql` — core tables (`stores`, `rewards`, `reward_tiers`,
  `submissions`, `store_admins`)
- `20261010203000_managed_tenant_foundation.sql` — collection tracking, `request_id` idempotency,
  rate limits, RLS policies, storage bucket, and the RPCs `submit_customer_entry`,
  `mark_submission_collected`, `save_store_tiers`
- `20261010203100_submissions_collection_index.sql` — dashboard index

With the CLI: `supabase db push`. Without it: paste the three files into the SQL Editor **in this
order**. (The old `0001_add_gift_collection_tracking.sql` was removed — it conflicted with the
second migration; its index lives on in file 3.)

Then seed the store: run `supabase/seed_jolly_enterprises.sql` in the SQL Editor once (idempotent,
safe to re-run).

### 4. Provision the first vendor account
1. **Authentication → Users → Add user** → set an email + password (check "Auto Confirm User").
2. Copy that user's **UID**.
3. In **SQL Editor**, map the user to the store (replace the UID and email):

```sql
-- store_1 in the seed file = this UUID; the vendor must be mapped to it.
insert into store_admins (store_id, user_id, email, role)
values ('00000000-0000-4000-a000-000000000001', 'PASTE-AUTH-USER-UID-HERE', 'owner@yourstore.com', 'owner');
```

A user without this mapping sees a friendly **"Admin has no associated store"** error — they cannot
see any store's data.

### 5. Set environment variables on the host
- **Vercel:** Project → Settings → Environment Variables → add `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, then **redeploy**.
- **GitHub Pages (this repo):** Actions does not expose Vite variables by default — the workflow's
  Build step must map repository **Variables** into the build environment (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`; the anon key is public by design — never the service-role key). Then
  re-run the workflow. If the variables are unset the build still succeeds but the site runs in
  demo mode, which the amber banner states honestly.

### 6. Log in
Open `<your-site>/vendor/login` and sign in with the email + password you created in step 4.
Unauthenticated visits to `/vendor/dashboard` are redirected to `/vendor/login`.

Once the two `VITE_` variables are present, both the customer app and the dashboard switch from
localStorage to the shared Supabase database automatically — **no code change or redeploy of the
app logic required** (just the env vars + redeploy on Vercel).

---

## Security notes
- No passwords, tokens, or `service_role` keys are stored in the source.
- Vendor access is scoped server‑side by `store_admins` + RLS — a vendor only ever sees their own
  store's customers, rewards, and settings.
- The local‑preview sign‑in is gated behind `import.meta.env.DEV` and is dead‑code in production.
