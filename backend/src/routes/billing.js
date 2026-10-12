import { Router } from 'express'
import crypto from 'node:crypto'
import { query } from '../db.js'
import { requireAuth, requireStoreMember, requireStoreOwner } from '../auth.js'
import { currentSubscription } from './owner.js'

const router = Router()

const RAZORPAY_API = 'https://api.razorpay.com/v1'

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

async function razorpayRequest(path, options = {}) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error?.description ?? `Razorpay request failed (${response.status})`)
  }
  return body
}

// --- owner-facing subscription routes (mounted at /api/owner) ---------------

router.get('/stores/:storeId/subscription', requireAuth, requireStoreMember, async (req, res, next) => {
  try {
    const sub = await currentSubscription(req.params.storeId)
    const period = new Date().toISOString().slice(0, 7)
    const usage = (await query('select submissions from usage_counters where store_id = $1 and period = $2', [req.params.storeId, period])).rows[0]?.submissions ?? 0
    res.json({ subscription: sub, usageThisMonth: usage, providerConfigured: razorpayConfigured() })
  } catch (error) {
    next(error)
  }
})

/**
 * Start a subscription checkout. With Razorpay credentials configured this
 * creates a real provider subscription; otherwise it returns a safe
 * test-mode instruction so the flow can be exercised without live keys.
 */
router.post('/stores/:storeId/subscription/checkout', requireAuth, requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const planId = String(req.body?.planId ?? '')
    const plan = (await query('select * from plans where id = $1 and active = true', [planId])).rows[0]
    if (!plan) return res.status(400).json({ error: 'Unknown or inactive plan.' })
    if (plan.price_inr === 0) return res.status(400).json({ error: 'The free trial plan does not require checkout.' })

    if (!razorpayConfigured()) {
      return res.status(503).json({
        error: 'Payments are not configured yet.',
        detail: 'Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET to enable live subscriptions.',
        testMode: true,
      })
    }

    const providerPlanId = plan.provider_plan_id ?? process.env[`RAZORPAY_PLAN_${planId.toUpperCase()}`]
    if (!providerPlanId) {
      return res.status(503).json({
        error: `No Razorpay plan id configured for "${plan.name}".`,
        detail: `Set RAZORPAY_PLAN_${planId.toUpperCase()} to the plan id created in your Razorpay dashboard.`,
      })
    }

    const created = await razorpayRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: providerPlanId,
        total_count: 120,
        quantity: 1,
        notes: { store_id: req.params.storeId, plan_id: plan.id },
      }),
    })

    await query(
      `update subscriptions set provider = 'razorpay', provider_subscription_id = $1, plan_id = $2, status = 'past_due', updated_at = now()
        where store_id = $3`,
      [created.id, plan.id, req.params.storeId],
    )

    res.json({
      provider: 'razorpay',
      subscriptionId: created.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      planId: plan.id,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/stores/:storeId/subscription/cancel', requireAuth, requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const sub = await currentSubscription(req.params.storeId)
    if (!sub) return res.status(404).json({ error: 'No subscription found.' })
    if (sub.provider === 'razorpay' && sub.provider_subscription_id && razorpayConfigured()) {
      try {
        await razorpayRequest(`/subscriptions/${sub.provider_subscription_id}/cancel`, { method: 'POST' })
      } catch (error) {
        return res.status(502).json({ error: `Could not cancel with the payment provider: ${error.message}` })
      }
    }
    await query("update subscriptions set status = 'cancelled', cancel_at_period_end = true, updated_at = now() where id = $1", [sub.id])
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

// --- webhook (mounted at /api/webhooks) -------------------------------------

export const webhookRouter = Router()

const STATUS_BY_EVENT = {
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.authenticated': 'active',
  'subscription.pending': 'past_due',
  'subscription.halted': 'past_due',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'expired',
  'subscription.paused': 'suspended',
}

webhookRouter.post('/razorpay', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return res.status(503).json({ error: 'Webhook secret is not configured.' })

  const signature = req.get('x-razorpay-signature')
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex')
  const signatureValid =
    signature && signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!signatureValid) return res.status(400).json({ error: 'Invalid webhook signature.' })

  let payload
  try {
    payload = JSON.parse(req.body.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload.' })
  }

  const eventId = req.get('x-razorpay-event-id') ?? payload?.id
  const eventType = payload?.event
  if (!eventId || !eventType) return res.status(400).json({ error: 'Missing event id or type.' })

  // Idempotency: a duplicate event id is acknowledged but not reprocessed.
  const inserted = await query(
    `insert into billing_events (provider, event_id, event_type, payload)
     values ('razorpay', $1, $2, $3) on conflict (provider, event_id) do nothing returning id`,
    [eventId, eventType, payload],
  )
  if (inserted.rowCount === 0) return res.json({ ok: true, duplicate: true })

  const providerSubscriptionId = payload?.payload?.subscription?.entity?.id
  if (!providerSubscriptionId) return res.json({ ok: true, ignored: true })

  const sub = (await query('select * from subscriptions where provider_subscription_id = $1', [providerSubscriptionId])).rows[0]
  if (!sub) return res.json({ ok: true, ignored: true })

  const nextStatus = STATUS_BY_EVENT[eventType]
  if (nextStatus) {
    const periodEnd = payload?.payload?.subscription?.entity?.current_end
    await query(
      `update subscriptions
          set status = $1, updated_at = now(),
              current_period_end = coalesce($2, current_period_end),
              grace_ends_at = case when $1 in ('past_due','expired') then now() + interval '7 days' else grace_ends_at end,
              cancel_at_period_end = case when $1 = 'cancelled' then true else cancel_at_period_end end
        where id = $3`,
      [nextStatus, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, sub.id],
    )
  }

  await query('update billing_events set store_id = $1, subscription_id = $2 where provider = $3 and event_id = $4', [
    sub.store_id, sub.id, 'razorpay', eventId,
  ])

  res.json({ ok: true })
})

export default router
