# JRIQ — Rollback One-Pager (jriq.in → warm origin)

Prepared: 2026-10-15. For the 60-minute watch window. Execute **without debate** if a
pre-authorised trigger fires. Target: under 5 minutes.

## Triggers (pre-authorised — act immediately)

1. **Deep-link 404** — `https://jriq.in/store/jolly-enterprises` stops returning the app
   (404/500 instead of 200).
2. **Claim persistence failure** — a real spin does not persist a claim row / claim code.
3. **Auth redirect loop** — vendor or platform login bounces without ever landing.

Who decides: the agent detects (watch script + curls), states "TRIGGER FIRED: <which>",
and guides the user through the numbered steps below. **No fix-forward without user
confirmation.**

## The rollback action (user, ~2 minutes)

The domain `jriq.in` is delegated to MyDNSVault (`luna/odin/neon.mydnsvault.com`), and the
zone was created during hosting provisioning (A → `45.199.139.29`, TTL per record).

1. Open **MyDNSVault** → zone `jriq.in`.
2. Edit the **A record** for `@` (apex):
   - Change the target from the MilesWeb host IP (`45.199.139.29`) to the **GitHub Pages
     origin IPs** (any one; Pages anycast):
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Set **TTL 300** (5 minutes) if not already.
3. Save. If a `www` CNAME exists, point it the same way (or leave it — the app canonically
   lives at the apex).
4. Tell the agent **"repointed"**.

## What this achieves — and what it does NOT (Verified analysis, read this)

- ✅ Traffic stops reaching the broken MilesWeb host within one TTL (≤ 5 min).
- ✅ **Nothing customer-critical is ever at risk**: all printed QR codes and shared links
  point at `https://shauryaojaswa.github.io/gift/...`, which serves continuously and is
  untouched by any DNS action. The claims ledger is in Supabase and unaffected.
- ⚠️ **The apex domain cannot fully render the app from GitHub Pages.** The verified Pages
  artefact is built with base `/gift/` (project site); a custom-domain apex serves the
  artefact at `/`, so `/assets/...` references would 404. The repoint therefore
  **neutralises** `jriq.in` (it stops serving a broken experience) but does not restore
  the app at the apex. Apex service is restored by fixing the MilesWeb upload and
  repointing the A record back (TTL 300 makes the return trip minutes too).

## Agent verification after repoint (agent, ~3 minutes)

```
nslookup jriq.in 1.1.1.1                     # resolves to a GitHub Pages IP
curl -sI https://jriq.in/                    # any non-MilesWeb response = traffic moved
curl -sI https://shauryaojaswa.github.io/gift/                       # 200 (customers safe)
curl -sI https://shauryaojaswa.github.io/gift/store/jolly-enterprises # SPA restore works
```

Record each result in the watch log (`logs/cutover-watch-*.log`) with a `ROLLBACK` line.

## Return to service

1. Fix the cause on MilesWeb (re-upload `index.html`/`.htaccess`, or whatever the failure
   was) and verify on the host IP/preview before repointing.
2. Repoint the A record back to `45.199.139.29` (TTL still 300).
3. Re-run the full verification matrix (`docs/CUTOVER_CHECKLIST.md` §5).
4. After a clean 60-minute watch, raise TTL to 3600+.
