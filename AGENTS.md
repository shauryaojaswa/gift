# AGENTS.md — Base44 setup notes

## Project

Vite 8 + React 19 + TypeScript + Tailwind 3 frontend-only app (no backend server).
Customer rewards "Spin & Win" flow with an admin panel.

## Running

```sh
docker compose -f docker-compose.base44.yml up -d --build
```

- Vite dev server runs on container port 5173, mapped to host port 3000.
- Dependencies are installed on container startup via `npm ci` (package-lock.json is committed).
- `node_modules` is stored in a named volume so it survives container restarts without reinstalling.
- Source is bind-mounted at `/app`, so edits hot-reload via Vite's HMR.

## Data provider

The app uses a pluggable data provider (`src/lib/data/`):
- If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are both set → uses Supabase.
- Otherwise → falls back to `LocalDataProvider` (browser localStorage).

No Supabase credentials are required to boot or use the app in the sandbox.
To connect a real Supabase project, set those two env vars as secrets.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | No | Falls back to local storage if unset |
| `VITE_SUPABASE_ANON_KEY` | No | Falls back to local storage if unset |
| `VITE_GOOGLE_REVIEW_URL` | No | Built-in default in `src/lib/google-review.ts` |

## Testing

```sh
npm test        # vitest run
npm run lint    # oxlint
npm run build   # tsc -b && vite build
```
