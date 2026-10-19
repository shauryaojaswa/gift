# Evidence — Full customer journey in demo mode (zero backend writes)

Captured 2026-10-18. Served `dist/` (the just-built bundle, built with **no** Supabase env vars →
`LocalDataProvider`, `src/lib/data/index.ts:41-50`) from a plain static server on
`http://localhost:4180/gift/jolly-enterprises`. All persistence went to browser localStorage keys
(`gift:local:submissions:{storeId}` etc., `src/lib/data/local.ts:17-19`). **No request left the
machine except Google Fonts.** No production or staging data was written.

## Journey (all steps observed live)

| # | Screen | Observed |
|---|---|---|
| 1 | WELCOME | "CUSTOMER REWARDS · SPIN & WIN · YOUR REWARD IS WAITING", button `START` |
| 2 | DETAILS | Progress stepper `DETAILS → REVIEW → SPIN → REWARD`; fields Full name, Purchase amount (chips ₹10K/₹40K/₹1L/₹2.5L), Phone |
| 2a | DETAILS (invalid) | Empty CONTINUE → inline alerts "Please enter your name." / "Please enter your purchase amount." (also verified on production, `jriq.in`) |
| 3 | REVIEW_INVITATION | "SHARE YOUR EXPERIENCE — If you want, share an honest review… A review is optional, and your reward is not affected."; `⭐ Leave a Google Review` **disabled** (demo store has no review link) and `CONTINUE TO SPIN` |
| 4 | SPIN | "YOUR REWARD IS READY", "YOUR PURCHASE ₹12,000", wheel rendered with labelled segments, button `Spin the wheel` |
| 5 | REWARD | "YOU WON — JEWELLERY CLEANING & POLISHING", "Congratulations! Your purchase has unlocked this special reward.", "Valid for 45 days from issue", claim code block |
| 6 | THANK_YOU | Summary list: Name `Audit Test User` · Purchase `₹12,000` · Reward `Jewellery Cleaning & Polishing` · Phone `******3210` (masked) · Claim Code `CLEAN-6CF36F` · validity |

Console errors across the entire journey: **none**. [Live-test]

## What this proves — and what it does not

- **Proves:** the complete customer state machine (WELCOME → DETAILS → REVIEW_INVITATION → SPIN →
  REWARD → THANK_YOU) executes end-to-end on the current source build; client-side validation,
  wheel rendering, reward display, phone masking, claim-code generation and persistence all work
  in the demo provider. [Live-test + Source-code]
- **Does not prove:** the Supabase-backed submission path end-to-end in a live environment. That
  path (RPC `submit_customer_entry`) is proven by unit/component tests (359/359 green) and prior
  QA artifacts (`artifacts/qa/`), and its live behaviour was verified only up to the pre-submission
  boundary on production, because submitting would write production data. [Verified fact /
  Unknown—blocked for a live end-to-end by the read-only constraint]
- Phone masking (`******3210`) is presentation-level; the demo store keeps the raw number in
  localStorage. [Source-code finding]
