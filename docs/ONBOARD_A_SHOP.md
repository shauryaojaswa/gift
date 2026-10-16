# Onboard a Shop — JRIQ v1.2.0

Runbook for taking a new jewellery shop from zero to a live, printed Spin & Win
campaign. Every step below maps to a screen that exists in the product today.

**Audience:** platform administrator (JRIQ operations) and the shop owner.
**Time:** about 15 minutes plus print time for the QR standee.

---

## 0. What you need before starting

| Item | Required | Notes |
| --- | --- | --- |
| Shop display name | Yes | Customer-facing, e.g. `Shree Jewellers` |
| Shop owner's email | Yes | Used for the owner login; must be an inbox the owner controls |
| Logo (JPG/PNG/WebP ≤ 5 MB) | Optional | Can be uploaded later by the owner |
| Google review link | Optional | Never required for a reward; customers always skip freely |
| Gift plan per purchase bracket | Optional at creation | Without it, customers see the designed "rewards being set up" state |
| Print budget for a QR standee | Optional | Counter card, poster or standee — PNG ≥ 1000 px or SVG |

You do **not** need to invent URLs. The system derives every address from the
shop's slug with one canonical builder, so the customer QR always decodes to
exactly `https://jriq.in/{slug}`.

---

## 1. Create the shop (platform admin, one screen)

1. Sign in to platform administration and open **Shops → New shop**.
2. **Shop name** — type the display name. The URL slug auto-fills from it.
3. **URL slug** — review the auto-slug (maximum 60 characters, lowercase
   letters/numbers/hyphens). The screen previews the live customer address as
   you type.
   * Reserved system words are rejected on screen **and** at the database
     boundary (the reserved-slug wall is server-side; the UI is a convenience).
   * A slug already used by another shop is rejected with
     `That address is already used by another shop.`
4. **Shop logo** — optional upload now. The preview appears immediately; the
   owner can replace it later.
5. **Owner email** — the shop owner's login email.
6. Click **Create shop**.

## 2. The result screen — the three deliverables

After creation the wizard shows the handover pack:

1. **Customer page** — `https://jriq.in/{slug}`
   The only address customers ever see. Scan or type; no login.
2. **Vendor admin** — `https://jriq.in/{slug}/admin`
   Where the shop owner signs in to run the campaign. (Legacy `/admin` keeps
   working for existing operators.)
3. **Printable QR code** — buttons **Download QR code** (PNG, 1200 px) and
   **Download print SVG** (vector, any print size).
   *Verified:* both artefacts decode to exactly `https://jriq.in/{slug}`.

The screen also reports the **owner-link status**, honestly:

| Status shown | Meaning | What to do |
| --- | --- | --- |
| `linked` | The owner account exists and is attached | Nothing — the owner can sign in now |
| `pending` (or anything else) | No owner account is attached yet | The owner must sign up first, then use **Link owner** on the shop card |

There is no "invited/active" fiction: the status printed is the status stored.

## 3. Owner setup (vendor admin at `https://jriq.in/{slug}/admin`)

1. The owner signs in (after signing up if the status was `pending`; then the
   platform admin presses **Link owner** on the shop card).
2. **Settings → Store Branding**
   * Store display name, subtitle, campaign badge.
   * **Brand colors** — pick primary and secondary. The preview shows exactly
     what customers see; if a colour is too light for readable text it is
     deepened automatically and the screen says so.
   * Logo upload.
   * **Google Review URL** — optional. If unset, no review step is offered.
   * Minimum qualifying purchase (₹).
3. **Gift options** (per purchase bracket, up to 4 gifts each, chosen from the
   gift catalogue) — these are the real wheel slices and the real awards.
   * A bracket with no configured pool shows customers the designed
     "REWARDS ARE BEING SET UP" state — never a fake prize.

## 4. Print and place the QR

1. Vendor admin → **My QR Code** (or the platform result screen).
2. Download **QR code** (PNG ≥ 1000 px, good for most printers) or **print
   SVG** (scales to any standee size without blur).
3. Print at the counter / on the standee. The printed link under the symbol is
   the same address the symbol decodes to: `https://jriq.in/{slug}`.

## 5. Prove the journey once (before going live)

On the printed address, as a customer:

1. **START** → enter name, 10-digit mobile, purchase amount (the tier chips and
   the placeholder show the shop's real thresholds).
2. **CONTINUE** — the reward is now **saved** (claim code issued). The review
   step is next and is always optional.
3. Review step — **CONTINUE TO SPIN** is always available and never waits for
   Google. The assistant copies your draft only when you press
   **Copy & Open Google Review**, confirms the copy, and handles popup blockers
   without losing the flow. Negative reviews are fine; nothing is auto-posted.
4. **Spin the wheel** — it stops on the prize already saved (5–8 s, reduced
   motion respected).
5. **Reveal** shows the actual gift name and claim code. **Thank you** makes no
   review claims.
6. In vendor admin → **Customers**, find the entry (name, phone, amount,
   bracket, gift, claim code, timestamps) and press **Mark collected** —
   double collection is rejected atomically.

## 6. Day-2 operations

* **Search** the shop list by name, slug or owner.
* **Suspend / reactivate** a shop from its status selector. A suspended shop
  refuses new submissions **at the database boundary**, not just in the UI.
* **Export CSV** from Customers for reconciliation (includes bracket and claim
  code columns).
* Reward claims are immutable snapshots: changing gifts later never rewrites
  what a customer already won.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `That address is reserved by the system.` | Slug collides with a JRIQ system route | Pick another slug (server enforces this too) |
| `That address is already used by another shop.` | Duplicate slug | Pick another slug |
| Owner cannot sign in to vendor admin | Status `pending` | Owner signs up; platform admin presses **Link owner** |
| Customer sees "REWARDS ARE BEING SET UP" | Bracket has no active gift pool | Add gift options for that bracket in vendor admin |
| Customer sees "THIS CAMPAIGN IS NOT ACTIVE" | Shop suspended or not active | Reactivate in platform admin |
| QR will not scan | Print too small or low contrast | Use the SVG at full size; keep the quiet zone |
| Claim already collected error | Someone collected it before | Intended — check `Collected at/by` in the drawer |

---

*Deliverable URLs come from one canonical builder (`getCampaignUrl`); QR
artefacts are generated by one pipeline (`src/lib/qr.ts`) whose PNG and SVG
outputs are decoded and payload-verified by `src/lib/qr.test.ts`.*
