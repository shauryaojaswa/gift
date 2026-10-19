# Known risks — evidence-backed register

Audit date: 2026-10-18. Severity: **P0** broken now / **P1** high exposure or trust risk /
**P2** correctness or completeness gap / **P3** hygiene. Labels: `[Verified fact]`, `[Source-code]`,
`[Live-test]`, `[Inference]`, `[Recommendation]`, `[Unknown]`.

| ID | Sev | Risk | Evidence | Impact if ignored | Mitigation `[Recommendation]` |
|---|---|---|---|---|---|
| R1 | P0 | GitHub Pages `/admin/login` crashes live (`useAdminAuth must be used within AdminAuthProvider`) | `[Live-test]` console trace; fix `e025b5a` @20:33 postdates Pages snapshot `22095f4` @08:35 `[Verified fact]` | Legacy admin users on the fallback host see a blank page; support load; perceived outage | Rebuild/refresh `gh-pages` from current source (or sunset the host) |
| R2 | P0 | Release-path ambiguity: `staging` +44 commits over `main`; each host deploys differently; Pages snapshot is manual | `[Verified fact]` git topology | Fixes land in one origin and not others (R1 already happened); auditors cannot answer "what is live where" | Document deploy source per origin; converge branches; automate Pages refresh |
| R3 | P1 | Public stale preview `gift-alpha-pearl.vercel.app` runs a pre-Backend localStorage build | `[Live-test]`: old title/copy, zero Supabase traffic | Customers on an unofficial URL get a flow that stores nothing; brand/trust damage | Remove or alias the deployment; consider a banner on old builds |
| R4 | P1 | Meaningful in-progress work is uncommitted (9 modified + 13 untracked incl. 2 migrations) | `[Verified fact]` `git status` | Single-machine loss; schema exists in staging but nowhere in git; accidental overwrite | Commit to a feature branch (push optional) |
| R5 | P1 | No CI on `main`/`staging` — quality gates run only manually | `[Verified fact]` no `.github` on those branches | Regressions merge unnoticed; the 359-test suite is not enforced | PR/push workflow running test + build |
| R6 | P2 | Live production E2E of the submission RPC was not performed (read-only constraint) | `[Unknown]` — writes prohibited | Residual doubt about the live write path (mitigated by tests + prior QA artifacts) | Schedule an ops-run staging E2E; keep production to read-only probes |
| R7 | P2 | Deploy env vars are Actions *variables*; missing vars silently switch to demo mode | `[Source-code]` workflow comment + provider selection | A rebuild without vars = silently non-persistent production | Post-deploy smoke assert on `dataProviderKind` |
| R8 | P2 | Owner onboarding loop incomplete (invitations exist, no self-serve accept surface found) | `[Source-code]` + `[Unknown]` for intended ops model | Owners cannot self-activate; platform manual work per shop | Decide model; add `/invite/:token` or document manual linking |
| R9 | P2 | `getStats()` aggregates client-side over fetched rows | `[Source-code]` `supabase.ts:338-359` | Slow dashboards and inconsistent numbers at scale | SQL aggregate RPC |
| R10 | P2 | RLS/RPC security model is code-reviewed but not penetration-tested | `[Unknown]` | Unknown policy gaps on future tables | Add a policy test suite (anon/authenticated matrix per table) + periodic review |
| R11 | P3 | README drift (describes pre-platform era) | `[Source-code]` README vs routes | Onboarding confusion | Refresh README |
| R12 | P3 | Pages `404.html` carries legacy `<title>`; deep links flash old branding | `[Live-test]` + `[Verified fact]` `public/404.html` | Cosmetic only | Update title in `404.html` |
| R13 | P3 | Lint not re-run this audit | `[Unknown]` | Style drift unseen | Run `npm run lint` |
| R14 | P3 | Prior QA report (`artifacts/qa/QA-REPORT.md`) retains PENDING markers | `[Verified fact]` | Ambiguous historical results | Close or annotate the pending items |
| R15 | P3 | Demo-mode phone masking is presentation-level | `[Source-code]` | None in production path; misleading in demos | Label clearly in demo UI |

## Risk-in-detail (the two P0s)

### R1 — Pages legacy admin crash
Reproduction: open `https://shauryaojaswa.github.io/gift/admin/login` → blank page; console:
`Error: useAdminAuth must be used within AdminAuthProvider` from `AdminContext-DbyiSCf0.js`.
The same route on `jriq.in/admin/login` renders the sign-in UI correctly. The code fix exists
(`e025b5a fix(ui): repair legacy /admin/login crash and standee QR overflow`); the Pages build
predates it. This is a deployment staleness failure, not a code failure. `[Live-test + Verified fact]`

### R2 — Deployment drift is structural
Three release surfaces (`main`, `staging`, manual `gh-pages` snapshot) and two hosting providers,
with no written mapping between them. R1 is the first observed casualty; the same structure makes
"verification on one origin" unreliable for the others. Every future fix carries the same risk
until the release path is defined. `[Verified fact + Inference]`

## Risks examined and found acceptable

| Concern | Verdict | Why |
|---|---|---|
| Public anon key exposure | Acceptable by design | RLS + RPC-only writes constrain anonymous callers `[Source-code]` |
| Customer double-claim via retry | Mitigated | `unique(store_id,request_id)` + replay logic `[Source-code]` |
| Reward manipulation by customer | Mitigated | Server-side draw; client never sends or influences the prize `[Source-code]` |
| Cross-tenant reads | Mitigated | `adminStoreId()` scoping + `is_store_admin` RLS + UI wall (UX only) `[Source-code]` |
| Deleting a reward breaks history | Mitigated | `ON DELETE RESTRICT` + snapshot columns `[Source-code]` |
| Stock over-claim | Mitigated (design) | Atomic increment gated on insert; counts never reset `[Source-code]` |
| Printed QR breaking on host change | Mitigated | `VITE_PUBLIC_APP_URL` pins QR output to jriq.in `[Source-code]` |
| Reserved slug shadowing system routes | Mitigated | Client `slugs.ts` + DB CHECK `[Source-code]` |
