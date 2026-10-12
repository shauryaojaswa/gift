import { Router } from 'express'
import { query, withTransaction } from '../db.js'
import { resolveTier, buildClaimCode } from '../reward-engine.js'
import { nameError, phoneError, purchaseAmountError, normalizePhone } from '../validate.js'

const router = Router()

/** Simple in-memory rate limiter for the public submission endpoint. */
const hits = new Map()
function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.params.slug}`
    const now = Date.now()
    const windowStart = now - 60_000
    const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart)
    if (timestamps.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' })
    }
    timestamps.push(now)
    hits.set(key, timestamps)
    next()
  }
}

export async function loadPublicStore(slug) {
  const { rows } = await query(
    `select s.*, sub.status as subscription_status, sub.plan_id, sub.trial_ends_at,
            sub.current_period_end, sub.grace_ends_at
       from stores s
       left join lateral (
         select * from subscriptions where store_id = s.id order by created_at desc limit 1
       ) sub on true
      where lower(s.slug) = lower($1)`,
    [slug],
  )
  const store = rows[0]
  if (!store) return null
  const rewards = (await query(
    'select * from rewards where store_id = $1 and active = true order by sort_order asc',
    [store.id],
  )).rows
  const tiers = (await query(
    'select * from reward_tiers where store_id = $1 and active = true order by min_amount asc',
    [store.id],
  )).rows
  return { store, rewards, tiers }
}

export function campaignAccess(subscriptionStatus, graceEndsAt) {
  if (!subscriptionStatus) return { active: true, reason: null }
  const graceValid = graceEndsAt && new Date(graceEndsAt).getTime() > Date.now()
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    return { active: true, reason: null }
  }
  if ((subscriptionStatus === 'past_due' || subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') && graceValid) {
    return { active: true, reason: null }
  }
  return {
    active: false,
    reason:
      subscriptionStatus === 'cancelled'
        ? 'This campaign is paused. Please contact the store.'
        : 'This campaign is temporarily unavailable. Please contact the store.',
  }
}

function toPublicStore(store, rewards, tiers, access) {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name ?? '',
    subtitle: store.subtitle ?? 'CUSTOMER REWARDS',
    logoUrl: store.logo_url ?? '/assets/brand-logo.png',
    primaryColor: store.primary_color ?? 'hsl(350 48% 27%)',
    secondaryColor: store.secondary_color ?? 'hsl(39 34% 59%)',
    googleReviewUrl: store.google_review_url ?? null,
    campaignBadge: store.campaign_badge ?? 'SPIN & WIN',
    minSpinAmount: store.min_spin_amount ?? 10000,
    campaignActive: access.active,
    campaignMessage: access.reason,
    rewards: rewards.map((r) => ({
      id: r.id,
      name: r.name,
      wheelLabel: r.wheel_label,
      description: r.description ?? '',
      claimCodePrefix: r.claim_code_prefix,
      validityText: r.validity_text,
      active: r.active,
    })),
    tiers: tiers.map((t) => ({
      id: t.id,
      minAmount: t.min_amount,
      maxAmount: t.max_amount,
      rewardId: t.reward_id,
      targetSegment: t.target_segment,
      active: t.active,
    })),
  }
}

router.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `select id, name, price_inr, billing_interval, trial_days, max_stores,
              max_submissions_per_month, csv_export, features, sort_order
         from plans where active = true order by sort_order asc`,
    )
    res.json({ plans: rows })
  } catch (error) {
    next(error)
  }
})

router.get('/stores/:slug', async (req, res, next) => {
  try {
    const config = await loadPublicStore(req.params.slug)
    if (!config) return res.status(404).json({ error: 'Store not found' })
    if (config.store.status !== 'active') {
      return res.status(403).json({ error: 'This store is not available right now.' })
    }
    const access = campaignAccess(config.store.subscription_status, config.store.grace_ends_at)
    res.json(toPublicStore(config.store, config.rewards, config.tiers, access))
  } catch (error) {
    next(error)
  }
})

/**
 * Create a customer submission. The reward is resolved server-side from the
 * purchase amount; the browser never supplies a reward id, name or value.
 */
router.post('/stores/:slug/submissions', rateLimit(20), async (req, res, next) => {
  try {
    const config = await loadPublicStore(req.params.slug)
    if (!config) return res.status(404).json({ error: 'Store not found' })
    if (config.store.status !== 'active') {
      return res.status(403).json({ error: 'This store is not available right now.' })
    }
    const access = campaignAccess(config.store.subscription_status, config.store.grace_ends_at)
    if (!access.active) return res.status(403).json({ error: access.reason })

    const customerName = String(req.body?.customerName ?? '').trim()
    const rawPhone = String(req.body?.phone ?? '')
    const purchaseAmount = Number(req.body?.purchaseAmount)

    const error =
      nameError(customerName) ||
      purchaseAmountError(purchaseAmount, config.store.min_spin_amount) ||
      phoneError(rawPhone)
    if (error) return res.status(400).json({ error })

    const tier = resolveTier(purchaseAmount, config.tiers, config.store.min_spin_amount)
    if (!tier) {
      return res.status(400).json({ error: 'We could not determine a reward for this purchase amount.' })
    }
    const reward = config.rewards.find((r) => r.id === tier.reward_id)
    if (!reward) return res.status(500).json({ error: 'The reward for this tier is unavailable.' })

    // Plan usage limit (never blocks access to existing data).
    const period = new Date().toISOString().slice(0, 7)
    const planId = config.store.plan_id
    if (planId) {
      const { rows } = await query('select max_submissions_per_month from plans where id = $1', [planId])
      const limit = rows[0]?.max_submissions_per_month
      if (limit != null) {
        const used = await query('select submissions from usage_counters where store_id = $1 and period = $2', [config.store.id, period])
        if ((used.rows[0]?.submissions ?? 0) >= limit) {
          return res.status(429).json({ error: 'This store has reached its monthly entry limit.' })
        }
      }
    }

    const result = await withTransaction(async (client) => {
      const phone = normalizePhone(rawPhone)
      const { rows } = await client.query(
        `insert into submissions
           (store_id, customer_name, customer_phone, purchase_amount, tier_id, reward_id,
            reward_label, reward_description, reward_voucher_amount, reward_validity_text,
            review_cta_shown, review_cta_clicked)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning *`,
        [
          config.store.id, customerName, phone, purchaseAmount, tier.id, reward.id,
          reward.name, reward.description, reward.voucher_amount, reward.validity_text,
          Boolean(req.body?.reviewCtaShown), Boolean(req.body?.reviewCtaClicked),
        ],
      )
      const submission = rows[0]
      const claimCode = buildClaimCode(reward.claim_code_prefix, submission.id)
      await client.query('update submissions set claim_code = $1 where id = $2', [claimCode, submission.id])
      await client.query(
        `insert into usage_counters (store_id, period, submissions) values ($1,$2,1)
         on conflict (store_id, period) do update set submissions = usage_counters.submissions + 1, updated_at = now()`,
        [config.store.id, period],
      )
      return { ...submission, claim_code: claimCode }
    })

    // Only the data the customer experience needs is returned.
    res.status(201).json({
      submissionId: result.id,
      claimCode: result.claim_code,
      purchaseAmount: result.purchase_amount,
      reward: {
        id: reward.id,
        name: result.reward_label,
        wheelLabel: reward.wheel_label,
        description: result.reward_description,
        voucherAmount: result.reward_voucher_amount,
        validityText: result.reward_validity_text,
      },
      targetSegment: tier.target_segment,
      createdAt: result.created_at,
    })
  } catch (error) {
    next(error)
  }
})

export default router
