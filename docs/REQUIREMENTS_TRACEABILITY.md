# JRIQ — Requirements Traceability

Last updated: 2026-10-15. Status vocabulary: `PASS — VERIFIED` (needs real evidence),
`PARTIAL`, `FAIL`, `BLOCKED`, `NOT VERIFIED`.
Evidence sources: [SV] `scripts/staging-verify.mjs` (DB/engine/tenancy, staging),
[UI] `scripts/ui-verify.mjs` (Playwright, staging), [UT] `npm test` (unit/component),
[PR] `scripts/preflight.mjs`, [GIT] repository state, [HTTP] live-site checks.

| ID | Required behaviour | Decision source | Implementation | Test case | Result | Evidence | Limitation / next action |
|---|---|---|---|---|---|---|---|
| R1 | Multi-tenant architecture: one platform, many isolated shops | Master requirements | `managed_tenant_foundation` + 4 JRIQ migrations | [SV] cross-tenant A↔B reads/writes denied | PASS — VERIFIED | [SV] 70/70 | — |
| R2 | Dynamic shop pages per slug with saved branding | Master requirements | `src/features/customer-flow`, `stores` table | [UI] welcome step renders saved campaign text + logo; details step uses saved `min_spin_amount` placeholder; name/URL/QR on platform row | PASS — VERIFIED | [UI] customer steps | Customer page design shows logo + campaign text + colors (name surfaces in admin/vendor/QR) — pre-existing design |
| R3 | Platform administration backend-enforced | Master requirements | `is_platform_admin()`, RPC guards | [SV] owner rejected from create_shop/set_store_status/admin_save_store_tiers/link_store_owner; self-escalation denied | PASS — VERIFIED | [SV] | — |
| R4 | Shop creation with defaults + idempotency | 2026-10-15 defaults order | `create_shop` RPC, `platform_policies.default_brackets` | [UI] Create Shop UI; [SV] idempotent retry, slug-reuse rejection | PASS — VERIFIED | [UI][SV] | — |
| R5 | Owner invitation + permission transitions | Master requirements | `store_owner_invitations`, `link_store_owner` | [SV] unregistered owner → pending → link → membership | PASS — VERIFIED | [SV] | — |
| R6 | Central gift catalogue (CRUD, activation, permissions) | Master requirements | `gift_catalog`, CatalogPage | [UI] add 2 gifts persists; [SV] owner insert/update denied, active read allowed | PASS — VERIFIED | [UI][SV] | — |
| R7 | Vendor per-bracket gift selection with persistence | Option B | `GiftPoolPanel`, vendor Rewards | [UI] select + save + reload persists | PASS — VERIFIED | [UI] | — |
| R8 | Eleven contiguous new-shop brackets (half-open) | 2026-10-15 defaults order | migration `20261015161000` seed | [UT] `default-brackets.test.ts` parses the real migration + boundary sweep; [SV] contiguity | PASS — VERIFIED | [UT][SV] | — |
| R9 | Maximum four gifts per bracket (platform-enforced) | Option B order | `save_store_gift_options` | [UT] 5th selection rejected client-side; [SV] 5th rejected server-side | PASS — VERIFIED | [UT][SV] | — |
| R10 | Equal-probability server-side selection, persisted pre-animation | Option B | `submit_customer_entry` (multipool) | [SV] χ² uniformity (1.50 then 6.00 vs 13.8 critical), pool membership of assigned gift | PASS — VERIFIED | [SV] 300-draw runs | Statistical + deterministic replay evidence |
| R11 | Legacy single-gift fallback preserved | Master requirements | engine fallback branch | [SV] legacy reward creation, legacy tiers, fallback assignment | PASS — VERIFIED | [SV] | — |
| R12 | Immutable saved reward/claim snapshots | Option B | `submissions` snapshot columns | [SV] catalogue rename + pool clearing do not rewrite saved rewards | PASS — VERIFIED | [SV] | — |
| R13 | Claim code format + idempotency + conflict rejection | Option B | `submit_customer_entry` | [SV] format check, identical retry replay, conflicting reuse rejected | PASS — VERIFIED | [SV] | — |
| R14 | Single collection, collector identity recorded | Master requirements | `mark_submission_collected` | [SV] double collection rejected, cross-tenant collection denied, collector recorded | PASS — VERIFIED | [SV] | — |
| R15 | Customer form validation + ₹ INR handling | Master requirements | DetailsScreen, currency/validation libs | [UT] currency+validation suites; [UI] empty submit blocked, valid submit proceeds | PASS — VERIFIED | [UT][UI] | — |
| R16 | Optional Google Review Assistant, neutral prompts | Google policy + Phase 6 | `GoogleReviewAssistant.tsx` | [UT] 8 tests: prompts are open questions, no testimonial phrases | PASS — VERIFIED | [UT][UI] | — |
| R17 | Copy only on user-initiated action | Google policy | copy buttons only | [UT] suggestion click never writes clipboard; explicit button copies; failure fallback | PASS — VERIFIED | [UT] | — |
| R18 | Skip-review path always works; review never gates reward | Master requirements | ReviewInvitation skip + assistant onSkip | [UI] CONTINUE TO SPIN path; [UT] skip callbacks | PASS — VERIFIED | [UI][UT] | — |
| R19 | Wheel reveals the saved backend reward (both tier modes) | Option B | `buildSegments(config, assigned)` | [UT] assigned override + placeholder; [UI] reward = pool gift | PASS — VERIFIED | [UT][UI] | — |
| R20 | Customer completion + returning-customer flow | Master history (c0941c5, cfa06e0) | SpinWinScreen, RewardScreen, ThankYouScreen | [UI] WELCOME BACK + Spin Now after assistant return; thank-you screen | PASS — VERIFIED | [UI][UT] | — |
| R21 | QR generation + customer URL per shop | Master requirements | ShopsPage, vendor QR page, `qrcode` | [UI] QR graphics on platform + vendor screens | PASS — VERIFIED | [UI] | Deep-link scan on a real device at release smoke |
| R22 | RLS + RPC authorization incl. anon minimisation | Master requirements | RLS policies, grant tightening migration | [SV] anon cannot read pools/write submissions; platform RPCs reject owners | PASS — VERIFIED | [SV] | — |
| R23 | Two-tenant runtime security tests | Validation order | staging harness shops A/B/C | [SV] A↔B matrix incl. legacy RPCs | PASS — VERIFIED | [SV] | — |
| R24 | Accurate generated DB TypeScript types | Master requirements | `src/lib/database.types.ts` | `tsc -b` exit 0 against regenerated types | PASS — VERIFIED | [PR] | Regenerate on every schema change |
| R25 | Full tests, lint, production build green | Master requirements | `package.json` scripts | `npm test` 213/213; lint 0; `tsc -b` 0; builds 0 | PASS — VERIFIED | [UT][PR] | — |
| R26 | Secret scanning incl. build output | Security rules | `scripts/preflight.mjs` | source strict scan + dist JWT role classification (service_role fails gate) | PASS — VERIFIED | [PR] | Re-run per release |
| R27 | Domain + hosting verification (jriq.in) | Phase 7 | — | DNS check | PARTIAL | DNS not resolving 2026-10-15; hosting/SSL/root Unknown | Needs MilesWeb login (user action) |
| R28 | Repeatable, low-effort deployment (both targets) | Phase 9 | build modes, preflight, `.htaccess`, SPA restore | [PR] pages 10/10, root 9/9 | PASS — VERIFIED | [PR][GIT] | MilesWeb upload method Unknown until R27 |
| R29 | Production backup + rollback readiness | Release gate | `PRODUCTION_RELEASE_PROPOSAL.md` | — | BLOCKED | Proposal prepared; pg_dump requires approval | Execute at release |
| R30 | Existing data + deployments preserved | Standing rule | git discipline | [GIT] main/gh-pages untouched; additive migrations only | PASS — VERIFIED | [GIT] | Protected records policy in status doc |
| R31 | Final documentation set | Master requirements | `docs/*` | review | PASS — VERIFIED | [GIT] | Keep current per change |
| R32 | New shops need no deploy / DNS change | Phase 9 requirement | `/store/:slug` client route + data-driven config | [UI] shop created via UI is live at its URL immediately | PASS — VERIFIED | [UI] | — |
| R33 | Onboarding semantics (config before activation) | Design §0 corrections | `create_shop` status, `is_store_admin` gate | [SV] platform configures during onboarding; owner cannot; owner sees no tiers | PASS — VERIFIED | [SV] | — |
| R34 | Suspended shops reject submissions | Master requirements | `submit_customer_entry` guard | [SV] suspended shop rejects | PASS — VERIFIED | [SV] | — |
| R35 | Public rate limit (5/hour per store+phone) | Foundation design | `public_submission_rate_limits` | [SV] rate-limit check | PASS — VERIFIED | [SV] | — |
| R36 | Platform screens: login, shops, catalogue usable | Master requirements | `src/features/platform/*` | [UI] login negative+positive, create shop, status, catalog | PASS — VERIFIED | [UI] | — |
| R37 | Review copy never fabricated as customer testimony | Google policy | prompts only, no auto-posting | [UT] neutral-prompt assertions; no network posting anywhere | PASS — VERIFIED | [UT] | — |

## Notes

- [SV] and [UI] run only against staging `wpytaorgiqkfnifsuhax` with synthetic data,
  self-cleaned after each run. Production is never a test environment.
- "PASS — VERIFIED" rows cite the harness/check that was actually executed on 2026-10-15.
- R27/R29 are external-gated (MilesWeb login; production approval) and block only the
  jriq.in cutover — not the staging release.
