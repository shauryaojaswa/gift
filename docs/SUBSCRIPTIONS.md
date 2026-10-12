# Subscription configuration guide

## Plans

Plans live in the `plans` table and are editable by the platform admin under
**Platform admin → Plans**. They drive both the public pricing page and the
subscription limits.

Seeded defaults (provisional launch pricing, editable):

| Plan | Price | Stores | Entries / month | CSV export | Trial |
|---|---|---|---|---|---|
| `trial` | ₹0 | 1 | 200 | no | 14 days |
| `starter` | ₹499 | 1 | 1,000 | no | — |
| `growth` | ₹999 | 1 | 5,000 | yes | — |
| `multi_store` | ₹2,499 | 10 | 20,000 | yes | — |

Leave **Entries / month** blank for unlimited. The trial length is
`plans.trial_days` and is applied when a store is created.

## Subscription states

`trialing → active → past_due → cancelled / expired / suspended`

The status is stored in `subscriptions` and only ever changed by the backend —
the platform admin or a verified payment webhook. Nothing in the browser can set
it.

## What a lapsed subscription does

When a subscription leaves `trialing`/`active` (or a past-due grace period
expires):

- The store's records, configuration and customer data are **preserved**.
- The public campaign page still renders and explains that the campaign is
  paused — customers never see a blank or broken page.
- New submissions are refused with an explanatory message.
- The owner sees their status and a renewal action in
  **Subscription & Billing**.

Grace periods are stored in `subscriptions.grace_ends_at`. The webhook sets a
7-day grace window when a subscription becomes past due or expired.

## Razorpay setup

The integration is implemented in `backend/src/routes/billing.js`. To enable it:

1. Create a Razorpay account and switch to **test mode** first.
2. Create a plan for each paid tier in the Razorpay dashboard.
3. Set the secrets in the app's environment (never in the repository):
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
   - `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_GROWTH`, `RAZORPAY_PLAN_MULTI_STORE`
4. Point a Razorpay webhook at `POST https://<your-api-host>/api/webhooks/razorpay`
   and subscribe to the `subscription.*` events.

### How the flow behaves

- **Checkout** (`POST /api/owner/stores/:id/subscription/checkout`) creates a
  provider subscription and stores its id. The local status moves to `past_due`
  until the provider confirms.
- **Verification** happens server-side from the webhook. Returning to a success
  URL in the browser never activates a subscription.
- **Webhook authenticity** is verified with an HMAC-SHA256 signature over the
  raw request body using `RAZORPAY_WEBHOOK_SECRET`, compared in constant time.
- **Idempotency** is enforced by a unique index on
  `billing_events (provider, event_id)`. A duplicate delivery is acknowledged
  but not reprocessed, so it cannot activate or charge twice.
- **Renewals, failures and cancellations** map to local status through
  `STATUS_BY_EVENT` in `billing.js`.

### Verification status

Without Razorpay credentials the webhook endpoint returns `503` and checkout
returns a clear "payments are not configured" message. This is the safe default
and it is what was verified in this environment.

**The live payment flow has not been tested** — no Razorpay account or
credentials were available. Do not treat subscriptions as production-ready until
the test-mode flow has been exercised end to end with real provider keys.
