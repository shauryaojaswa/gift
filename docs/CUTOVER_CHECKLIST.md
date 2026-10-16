# JRIQ — Cutover Checklist v2

Prepared: 2026-10-15 (updated 2026-10-16). Single ordered list merging the go-live
runbook and the 6-row external verification matrix. `Filled by` column:
**agent-shell** = the agent can complete/verify without the user; **user-browser** =
requires the user's hands in a browser.

Companion docs: `DEPLOYMENT.md` (hosting facts + DNS sheet), `ROLLBACK.md`
(triggers + repoint steps), `RELEASE_READINESS.md` (defect/fix/experiment record).

## 0. Pre-cutover reference counts (production `jwellery`, 2026-10-15, VERIFIED read-only)

The watch window compares against these. Any unexplained drift is an anomaly.

| Table | Rows |
|---|---|
| stores | 1 |
| submissions | 2 |
| platform_audit_logs | 28 |
| reward_tiers | 8 |
| rewards | 8 |
| tier_gift_options | 0 |
| gift_catalog | 0 |
| store_admins | 1 |
| platform_admins | 0 |
| store_subscriptions | 0 |
| protected_claims (GIFT-DDD89040, CLEAN-0CBBDC9A) | 2 |
| supabase_migrations.schema_migrations | 8 |

## 1. Phase M — hosting & upload

| # | Step | Done | Filled by | Evidence |
|---|---|---|---|---|
| 1.1 | Site space provisioned for jriq.in | ☑ | user-browser | mPanel site created (2026-10-15) |
| 1.2 | Document root recorded (`public_html`) | ☑ | user-browser | mPanel domain panel screenshot |
| 1.3 | Upload method decided + recorded | ☐ | agent-shell | DEPLOYMENT.md §5 |
| 1.4 | Upload assets bundle (47 files) | ☐ | agent-shell/user-browser | curl asset 200s |
| 1.5 | Curl-verify assets BEFORE final files | ☐ | agent-shell | `curl -sI https://jriq.in/assets/<file>` = 200 |
| 1.6 | Upload `index.html` + `.htaccess` LAST | ☐ | agent-shell/user-browser | curl `/` serves app |
| 1.7 | Placeholder handling recorded (MilesWeb `.htaccess` 503 block) | ☐ | agent-shell | DEPLOYMENT.md §5 |
| 1.8 | File-size limit recorded (incl. 2.25 MB `brand-logo.png`) | ☐ | agent-shell | DEPLOYMENT.md §5 |
| 1.9 | mod_rewrite verdict with deep-link curl | ☐ | agent-shell | `curl -sI https://jriq.in/store/jolly-enterprises` = 200 |
| 1.10 | AutoSSL mechanism + cert validity | ☑/☐ | agent-shell | cert issued 2026-10-15, valid to 2027-01-13 (VERIFIED via TLS probe) |
| 1.11 | IPv6 status | ☑ | agent-shell | No AAAA record (VERIFIED `nslookup -type=AAAA`) |

## 2. Decision gate (state the result explicitly)

MilesWeb = **PRIMARY** only if all three hold:
- ☐ SPA fallback: deep link returns the app (200) — item 1.9
- ☐ SSL valid chain on `https://jriq.in` — item 1.10
- ☐ Upload path verified — item 1.6

Else: **Pages stays primary**, MilesWeb parked, raise a MilesWeb support ticket
(deep-link/mod_rewrite evidence attached).

## 3. Phase C — cutover prerequisites

| # | Step | Done | Filled by | Evidence |
|---|---|---|---|---|
| 3.1 | `platform_admins` bootstrap question asked (one question) | ☐ | user-browser | user's answer |
| 3.2 | Bootstrap executed per answer (or documented deferral) | ☐ | user-browser | dashboard insert / deferral note |
| 3.3 | DNS zone confirmed complete (A → `45.199.139.29`) | ☑ | agent-shell | SOA `2026101500`, resolves local + 1.1.1.1 (2026-10-15) |
| 3.4 | Propagation check local + vs 1.1.1.1 (SERVFAIL gone) | ☑ | agent-shell | `nslookup` both resolvers agree |
| 3.5 | TTL recorded on A record (must be ≤ 300 for cutover) | ☐ | agent-shell | `Resolve-DnsName jriq.in` |

## 4. Post-upload verification (before declaring)

| # | Check | Done | Filled by | Evidence |
|---|---|---|---|---|
| 4.1 | `https://jriq.in/` serves the app (not placeholder/404) | ☐ | agent-shell | curl body contains app shell |
| 4.2 | All `index.html`-referenced assets return 200 | ☐ | agent-shell | parsed + curled each |
| 4.3 | Deep link returns app (mod_rewrite verdict) | ☐ | agent-shell | curl status + body |
| 4.4 | SSL chain valid (openssl/curl) | ☐ | agent-shell | curl output |

## 5. External verification matrix (every row evidenced)

| # | Row | Done | Filled by | Evidence |
|---|---|---|---|---|
| 5.1 | jriq.in loads | ☐ | agent-shell | curl + user confirm |
| 5.2 | `/store/jolly-enterprises` 200 on HARD REFRESH | ☐ | user-browser | screenshot / status |
| 5.3 | Real spin persists a claim with code | ☐ | agent-shell | `scripts/postlaunch-smoke.mjs` (one synthetic spin, self-cleaning) |
| 5.4 | Vendor login scoped | ☐ | agent-shell | curl auth probe / user confirm |
| 5.5 | Platform login (or documented deferred) | ☐ | user-browser | login screenshot / deferral note |
| 5.6 | Pages `/gift/` still serving (rollback warm) | ☐ | agent-shell | `scripts/cutover-watch.mjs` pages row |

## 6. Watch window (60 minutes)

| # | Step | Done | Filled by | Evidence |
|---|---|---|---|---|
| 6.1 | `node scripts/cutover-watch.mjs` running (2-min rounds) | ☐ | agent-shell | `logs/cutover-watch-*.log` |
| 6.2 | Watch auth errors / submission volume / audit log / host logs | ☐ | agent-shell | counts vs §0 baseline |
| 6.3 | Rollback triggers armed (`ROLLBACK.md`) | ☑ | agent-shell | ROLLBACK.md published |
| 6.4 | If trigger fires → repoint A → Pages origin (TTL 300) | ☐ | user-browser | ROLLBACK.md steps |

## 7. Declare

| # | Step | Done | Filled by | Evidence |
|---|---|---|---|---|
| 7.1 | Clean 60-min window achieved | ☐ | agent-shell | watch log all-PASS |
| 7.2 | TTL raised to 3600+ | ☐ | user-browser | `Resolve-DnsName` |
| 7.3 | Declare "jriq.in is live and verified" | ☐ | agent-shell | final report |
