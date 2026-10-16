# JRIQ Demo Kit

Everything needed to run a live, credible JRIQ demo — or to hand a prospect a
self-guided walkthrough. All examples use synthetic data; nothing here touches
production shops.

## Contents

| File | Purpose |
| --- | --- |
| `DEMO_SCRIPT.md` | 5-minute talk track with the exact screens and strings to expect |
| `README.md` | This index: setup, demo data, cleanup, evidence locations |

## Demo setup (10 minutes before the meeting)

1. **Create one demo shop** through the platform wizard
   (`Shops → New shop`), name it something obviously synthetic,
   e.g. `Demo Jewellers`, slug `demo-jewellers-<date>`.
   * Keep the owner email as one you control → the result screen shows
     `linked` and you can sign straight into the vendor admin.
   * Upload any placeholder logo (or skip — the themed monogram fallback is
     itself part of the story).
2. **Add gift options** in vendor admin → Gift options: two brackets with 3–4
   gifts each (e.g. `GOLD COIN`, `SILVER COIN`, `GIFT HAMPER`,
   `₹1,000 VOUCHER`). Leave one bracket empty on purpose — it demonstrates the
   honest "REWARDS ARE BEING SET UP" state.
3. **Set brand colours** in Settings (pick anything; the accessibility clamp is
   a demo point — try a very light gold and show the deepening notice).
4. **Download the QR** (PNG or print SVG) and open the customer page on a phone
   by scanning the real symbol — that scan *is* demo point #1.
5. Optional: set a Google review URL for your own Google Business profile so the
   review assistant can be shown honestly.

## Demo data rules

* Synthetic names/numbers/amounts only. Use a phone number you own; amounts
  like ₹15,000 / ₹55,000 are enough to hit two brackets.
* The reward is claimed **once** per submission — to repeat the spin demo,
  refresh the customer page and start a new entry.
* Everything the demo creates lives in the demo shop: after the meeting, delete
  the shop's submissions and suspend or delete the shop. Nothing else needs
  cleaning.

## Evidence and screenshots

Release evidence packs (before/after customer screenshots at 390×844 and
desktop, QR decode proofs, acceptance logs) live outside the repo in the
session temp folders referenced by the release report:

* `%TEMP%\jriq-url-acceptance` — URL/acceptance run screenshots
* `%TEMP%\jriq-visual-audit` — customer visual audit (before/after pairs)

The release report (`docs/`) labels every claim VERIFIED / REPORTED / INFERRED /
UNVERIFIED / BLOCKED / FAILED.

## Running the demo against production

`https://jriq.in/{slug}` is the live product. For a first demo, prefer a staging
or demo shop over any real shop; never point the demo at a real shop's QR or
collect real customer phone numbers on stage.
