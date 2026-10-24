# Shree Manali Ethnic Galore — launch snapshot set

Captured 2026-18-10 against the release that went live on **https://jriq.in** (same build
verified `52/52` byte-identical by `scripts/byte-verify.mjs dist https://jriq.in`).

## customer/ (local build, staging data)
| Shot | Proves |
|---|---|
| 01-welcome | Real Manali logo (the Kohinoor file is gone), shop identity |
| 02-details-form | Details step, quick-amount chips start at ₹1 (spin floor = Re 1) |
| 03-review-step | Review step — reward already saved (persist-first), review optional |
| 04-review-assistant | Google Review assistant: 10 ethnic-wear starters, topic chips, one-tap copy |
| 05-wheel-mid-spin-all-gifts | **Every gift on its own block** (8 distinct slices) mid-rotation |
| 06-reward-reveal | Reveal shows the exact engine-assigned reward + claim code |
| 07-thank-you | Receipt with masked phone, claim code, Google review CTA |

## admin/ (owner dashboard, staging data)
01-dashboard-overview, 02-rewards-ladder (the 8-band ladder + wheel labels + review link),
03-settings-branding (logo, slug, review URL, spin floor).

## live/ (https://jriq.in — production)
| Shot | Proves |
|---|---|
| live-01-welcome | Live site, real logo |
| live-02-wheel-8-gifts | The 8-gift wheel live: 40% OFF INVOICE / FREE DELIVERY / MOBILE CHARM / 25% OFF INVOICE / … |
| live-03-reveal | Live spin of ₹7,500 revealed "RS 500 OFF ON NEXT PURCHASE" (claim GIFT-6E517226) 3.5 s after the tap |

## Contract proven
- The wheel **advertises every gift** the shop awards; the purchase amount decides the win.
- The wheel **stops on and reveals exactly the engine-assigned prize** — verified through the
  live UI and `scripts/verify-catalog.mjs` (18/18 boundary mappings, both sides of every
  boundary, self-cleaned) on both staging and production.
- The spin **always rotates for a few seconds** before the gift appears (7 s normally;
  3 s shorter/gentler when the device asks for reduced motion — previously it snapped
  instantly, which is what made the demo look frozen).
