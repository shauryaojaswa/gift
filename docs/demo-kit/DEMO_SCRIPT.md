# JRIQ Demo Script — 5 minutes

A tight, honest walkthrough. Say only what the screens show; every claim below
is backed by something visible on stage.

---

## 0:00–0:40 — The customer's 60 seconds (start here, on a phone)

Scan the printed QR (or open `https://jriq.in/demo-jewellers-…`).

* "The scan opens this shop's page — the shop's own name, logo and colours.
  No app, no login."
* Tap **START**. Point out the amount placeholder and the tier chips: "these
  are this shop's real purchase brackets, in rupees, formatted for India."
* Enter name, your real phone, an amount in a bracket that has gifts.
  **CONTINUE**.

**Proof point:** "The reward is saved *now* — before any review. The claim code
exists. A review can never change it."

## 0:40–1:30 — The optional review (policy-safe by design)

* "This step is optional and it is never pressured: 'A review is optional, and
  your reward is not affected.' **CONTINUE TO SPIN** is always here and never
  waits for Google."
* Press the assistant: **Share Your Experience** — twelve neutral topic
  questions, an editable draft in the customer's own words. "We never write or
  submit the review for anyone."
* Press **Copy & Open Google Review** — "the copy is confirmed only when the
  clipboard actually accepted it, and if the browser blocks the new tab, we say
  so and keep the flow." (If your demo device blocks popups, this is a feature
  demo — show the fallback link.)
* Optional: show that a *negative* review is fine. "There is no incentive,
  condition or quid pro quo anywhere in this product."

## 1:30–2:30 — Spin, reveal, thank you

* Back on the spin step (returning shows **WELCOME BACK!** + **Spin Now** —
  same saved claim, no second reward).
* Tap **Spin the wheel**: "the wheel shows this bracket's real approved gifts.
  No placeholder slices." It lands on the gift already saved — the animation
  never decides anything.
* **Reveal:** the actual gift name and the claim code from the saved snapshot,
  with the collect-at-the-counter line.
* **Thank you** — "no review claims on this screen. The customer owes us
  nothing."

## 2:30–3:30 — Vendor operations (`https://jriq.in/{slug}/admin`)

* Sign in as the shop owner. Dashboard shows the campaign at a glance.
* **Customers:** "every submission shows name, phone, amount, the bracket, the
  gift from the immutable snapshot, claim code and timestamps."
  * Tap one → drawer → **Mark collected**. "Double collection is rejected
    atomically — try it."
  * **Export CSV** — includes bracket and claim code.
* **Settings → Brand colours:** pick a very light colour live. "The preview
  shows exactly what customers see; the notice explains the automatic
  deepening for readability."
* **QR Code & Branding:** "Download QR code (PNG, 1200 px) or print SVG. Both
  decode to exactly `jriq.in/{slug}` — we verify that with a decoder, not by
  eye."

## 3:30–4:20 — Platform administration

* **Shops → New shop** (use a throwaway name like `Demo Two Jewellers`):
  * Type the name — the slug auto-fills. "Reserved system words are refused
    here *and* in the database."
  * Try a duplicate slug of an existing shop → refused.
  * Logo upload and owner email complete the one-screen wizard.
* **Create shop** → result screen: "the three deliverables — customer page,
  vendor admin, printable QR — plus an honest owner-link status."
* Search the shop list; suspend a shop live. "A suspended shop refuses new
  submissions at the database boundary — the API, not the UI, is the wall."

## 4:20–5:00 — Why it's built this way (say this plainly)

* "Persist first: the claim is recorded before anything else, and the wheel
  only animates to what is already saved."
* "Claims are immutable snapshots — prize, claim code, bracket, timestamps.
  Changing gifts later never rewrites a customer's win."
* "Every shop is isolated in the database: one shop's data is unreachable from
  another shop's page, admin or QR."
* Close on the one-line promise:
  **"Shop onboarding, customer rewards, the optional Google review assistant,
  vendor operations and platform administration — proven end to end."**

---

### If something goes wrong mid-demo

| Problem | Recovery line / action |
| --- | --- |
| Popup blocked on the review step | "That's the fallback we designed — the link is right here." |
| Bracket shows "REWARDS ARE BEING SET UP" | "Honest state — that bracket has no gifts configured yet." |
| Phone camera fails to scan | Open the printed link text under the symbol — it is the same address |
| Demo shop accidentally suspended | Platform admin → Shops → set status `active` |

Cleanup after the demo: delete the demo shop's submissions, then suspend or
delete the shop (see `README.md`).
