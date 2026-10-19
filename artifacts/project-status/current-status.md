# Current status — Jewellery QR Spin & Win (JRIQ)

Audit date: 2026-10-18 · Method: read-only inspection of the repository + real-browser
verification of every known hosted origin. No application code, infrastructure, or data was
modified. Reports live only in `artifacts/project-status/`.

**Statement labels used throughout all reports:**
`[Verified fact]` directly observed repo/infra state · `[Source-code]` read from source or
migrations · `[Live-test]` observed in a real browser against a live origin · `[Inference]`
reasoned from evidence · `[Recommendation]` proposed, not implemented · `[Unknown]` cannot be
established with available access.

---

## 1. One-paragraph status

The product is a working, multi-tenant "Spin & Win" SaaS for jewellers: one React SPA serves
customer, shop-owner, legacy-admin and platform-admin surfaces over a Supabase (Postgres) backend
where reward assignment is server-side and auditable. The current source builds cleanly and its
test suite is green (**359/359**, 27 files). The two live surfaces work: `jriq.in` (production) is
functionally current, while the GitHub Pages fallback host is **one fix behind** — its legacy
`/admin/login` route crashes live (fix exists in git, not deployed there). A third URL,
`gift-alpha-pearl.vercel.app`, serves a stale pre-Backend demo build. The branch topology is
unusual: `staging` is 44 commits ahead of `main`, and a meaningful amount of in-progress work sits
**uncommitted** in the working tree.

## 2. Status dashboard

| Area | Status | Evidence class |
|---|---|---|
| Source builds (`tsc -b` + `vite build`) | ✅ Clean, 8.13s | Verified fact |
| Test suite (vitest) | ✅ 359/359, 27 files | Verified fact |
| Customer flow (end-to-end, demo provider) | ✅ Full journey, 0 console errors | Live-test |
| Customer flow (Supabase path, live) | ✅ Verified to the write boundary; RPC path proven by tests | Live-test + Source-code |
| Production origin `jriq.in` | ✅ Functional, current-ish (≥ commit `e025b5a`) | Live-test |
| GitHub Pages `github.io/gift/` | ⚠️ Functional except legacy `/admin/login` (**crashes**) | Live-test |
| Vercel preview `gift-alpha-pearl.vercel.app` | ⚠️ Stale demo-era build (no backend) | Live-test |
| Reward fairness (server-side draw) | ✅ Implemented in RPC; client cannot influence | Source-code |
| Auth & tenant isolation | ✅ RLS + SECURITY DEFINER RPCs + UI gates | Source-code (not pen-tested) |
| Schema / migrations | ✅ 15 files, 2 uncommitted but applied-to-staging earlier (see note) | Verified fact |
| CI | ⚠️ No workflows on `main`/`staging`; only `gh-pages` deploy workflow | Verified fact |
| Uncommitted working tree | ⚠️ 9 modified + 13 untracked files, on no branch | Verified fact |
| Branch freshness | ⚠️ `staging` +44 commits over `main`; deploy sources differ per origin | Verified fact |
| Lint | ⏳ Not re-run this audit | Unknown |
| Live production-write E2E | ⛔ Deliberately not run (read-only constraint) | Unknown |

Note on migrations: the two files `20261017150000_*` / `20261017150100_*` are uncommitted in the
working tree. A prior (pre-audit) session applied them to the staging project and verified them
there; this audit did not apply, alter, or re-verify them in any database. `[Verified fact for the
working tree; prior-session record for the staging application]`

## 3. What "working" means here (the honesty rules applied)

- A route rendering is **not** a feature working. Where a feature is marked functional below it is
  backed by either an executed test, a live behavioural observation, or a server-side invariant.
- `github.io` and `jriq.in` both talk to the **production** Supabase project (observed in network
  logs). Demo/localStorage mode exists only when `VITE_SUPABASE_*` are absent (verified in the
  local bundle walkthrough, where the whole journey ran with zero backend traffic).
- The production submission path was **not** exercised end-to-end in a live environment, because
  the submission RPC is invoked on the DETAILS "CONTINUE" button (`DetailsScreen.tsx:118`) and
  would write a production row. The read-only constraint stopped the audit at the validation
  boundary. `[Source-code + Unknown—live E2E]`

## 4. Remaining work, prioritised from evidence

### P0 — broken or blocking right now

1. **GitHub Pages `/admin/login` crashes live** (`useAdminAuth must be used within AdminAuthProvider`).
   The fix (`e025b5a`) exists on `staging` but the Pages snapshot (22095f4) predates it by ~12h.
   *Action:* refresh the `gh-pages` source snapshot from current `staging` and let the workflow
   redeploy (or decide to sunset the Pages host). `[Live-test + Verified fact]`
2. **`staging`/`main`/deploy-source divergence** (staging +44 commits; Pages from a manual
   snapshot; jriq.in source of truth unknown). A bugfix can be "done" yet missing on one origin —
   exactly what P0-1 demonstrates. *Action:* define and document the single release path
   (which branch each origin deploys from), then converge branches. `[Verified fact + Recommendation]`

### P1 — correctness / trust risks with evidence of exposure

3. **Stale demo-era Vercel preview is publicly reachable** (`gift-alpha-pearl.vercel.app`, old
   localStorage build). Customers landing on it get a flow that persists nowhere. *Action:*
   remove/alias the deployment or add a banner. `[Live-test + Recommendation]`
4. **Uncommitted in-progress work** (price policy, stock, shop config panels, 2 migrations) sits on
   no branch — single-machine risk (loss, accidental overwrite), and its schema is applied to
   staging while absent from git. *Action:* commit to a branch (no push needed) after review. `[Verified fact + Recommendation]`
5. **No CI on `main`/`staging`** — tests/build gate runs only manually. *Action:* add a workflow
   running `npm test` + `npm run build` on PR/push. `[Verified fact + Recommendation]`

### P2 — product completeness gaps (source-level findings)

6. Owner onboarding is partial: `create_shop` supports `unclaimed` shops and invitation records,
   but no self-serve invite-acceptance surface was found in the client; `link_store_owner` is
   platform-invoked. *Confirm intended operating model, then close the loop.* `[Source-code + Unknown]`
7. `getStats()` aggregates client-side after fetching submission columns (fine at current scale,
   wasteful and race-prone later). `[Source-code + Recommendation]`
8. Demo-mode phone masking is presentation-only. `[Source-code]` (documented behaviour)

### P3 — hygiene and polish

9. README drift: README describes an older state ("no central platform-owner onboarding…") than the
   code (full `/platform` surface exists). `[Source-code + Verified fact]`
10. `404.html` on Pages carries the legacy `<title>` (cosmetic). `[Live-test + Verified fact]`
11. Lint not re-verified this audit; run `npm run lint` when convenient. `[Unknown]`
12. Historical QA artifacts (`artifacts/qa/QA-REPORT.md`) still contain PENDING markers from an
    earlier campaign. `[Verified fact]`

## 5. What was deliberately not done

No code changes, commits, pushes, merges, deploys, migrations, DB writes, or production data
changes. The production customer journey was exercised only up to the pre-submission validation
boundary. Screenshots could not be captured in this environment (text evidence preserved instead).
