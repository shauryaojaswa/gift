import { Router } from 'express'
import { query, withTransaction } from '../db.js'
import { requireAuth, requireStoreMember, requireStoreOwner } from '../auth.js'
import { validateTiers, TierConfigError } from '../reward-engine.js'
import { insertDefaultConfig, DEFAULT_STORE } from '../defaults.js'
import { slugify, isValidSlug } from '../validate.js'

const router = Router()
router.use(requireAuth)

export function serializeStore(store, rewards, tiers) {
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
    status: store.status,
    rewards: rewards.map((r) => ({
      id: r.id,
      name: r.name,
      wheelLabel: r.wheel_label,
      description: r.description ?? '',
      voucherAmount: r.voucher_amount,
      claimCodePrefix: r.claim_code_prefix,
      validityText: r.validity_text,
      terms: r.terms,
      active: r.active,
      sortOrder: r.sort_order,
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

async function loadStoreConfig(storeId) {
  const store = (await query('select * from stores where id = $1', [storeId])).rows[0]
  if (!store) return null
  const rewards = (await query('select * from rewards where store_id = $1 order by sort_order asc, created_at asc', [storeId])).rows
  const tiers = (await query('select * from reward_tiers where store_id = $1 order by min_amount asc', [storeId])).rows
  return { store, rewards, tiers }
}

export async function currentSubscription(storeId) {
  const { rows } = await query(
    `select s.*, p.name as plan_name, p.price_inr, p.max_stores, p.max_submissions_per_month, p.csv_export, p.features
       from subscriptions s join plans p on p.id = s.plan_id
      where s.store_id = $1 order by s.created_at desc limit 1`,
    [storeId],
  )
  return rows[0] ?? null
}

function subscriptionSummary(sub, usageThisMonth) {
  if (!sub) return null
  const now = Date.now()
  const trialEnds = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null
  const daysRemaining = trialEnds ? Math.max(0, Math.ceil((trialEnds - now) / 86_400_000)) : null
  return {
    planId: sub.plan_id,
    planName: sub.plan_name,
    priceInr: sub.price_inr,
    status: sub.status,
    trialEndsAt: sub.trial_ends_at,
    currentPeriodEnd: sub.current_period_end,
    graceEndsAt: sub.grace_ends_at,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    daysRemaining,
    features: sub.features,
    limits: { maxStores: sub.max_stores, maxSubmissionsPerMonth: sub.max_submissions_per_month, csvExport: sub.csv_export },
    usage: { submissionsThisMonth: usageThisMonth },
  }
}

// --- stores -----------------------------------------------------------------

router.get('/stores', async (req, res, next) => {
  try {
    const { rows } = await query(
      `select s.*, m.role from stores s
         join store_members m on m.store_id = s.id
        where m.user_id = $1 order by m.created_at asc`,
      [req.user.id],
    )
    const stores = []
    for (const store of rows) {
      const sub = await currentSubscription(store.id)
      stores.push({
        id: store.id,
        slug: store.slug,
        name: store.name ?? '',
        logoUrl: store.logo_url,
        role: store.role,
        status: store.status,
        subscriptionStatus: sub?.status ?? null,
        planId: sub?.plan_id ?? null,
      })
    }
    res.json({ stores })
  } catch (error) {
    next(error)
  }
})

router.post('/stores', async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim()
    const requestedSlug = String(req.body?.slug ?? '').trim().toLowerCase()
    const slug = requestedSlug || slugify(name)
    if (!isValidSlug(slug)) {
      return res.status(400).json({ error: 'Please choose a URL slug with letters, numbers and hyphens only.' })
    }
    const clash = await query('select 1 from stores where lower(slug) = $1', [slug])
    if (clash.rowCount > 0) return res.status(409).json({ error: 'That URL slug is already taken.' })

    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `insert into stores (slug, name, subtitle, logo_url, primary_color, secondary_color, google_review_url, campaign_badge, min_spin_amount)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [
          slug, name, DEFAULT_STORE.subtitle,
          req.body?.logoUrl || DEFAULT_STORE.logo_url,
          req.body?.primaryColor || DEFAULT_STORE.primary_color,
          req.body?.secondaryColor || DEFAULT_STORE.secondary_color,
          req.body?.googleReviewUrl || null,
          DEFAULT_STORE.campaign_badge, DEFAULT_STORE.min_spin_amount,
        ],
      )
      const store = rows[0]
      await client.query('insert into store_members (store_id, user_id, role) values ($1,$2,$3)', [store.id, req.user.id, 'owner'])
      await insertDefaultConfig(client, store.id)
      const trialDays = (await client.query("select trial_days from plans where id = 'trial'")).rows[0]?.trial_days ?? 14
      await client.query(
        `insert into subscriptions (store_id, plan_id, status, trial_ends_at)
         values ($1,'trial','trialing', now() + ($2 || ' days')::interval)`,
        [store.id, trialDays],
      )
      return store
    })

    const config = await loadStoreConfig(created.id)
    res.status(201).json(serializeStore(config.store, config.rewards, config.tiers))
  } catch (error) {
    next(error)
  }
})

router.get('/stores/:storeId', requireStoreMember, async (req, res, next) => {
  try {
    const config = await loadStoreConfig(req.params.storeId)
    if (!config) return res.status(404).json({ error: 'Store not found' })
    const sub = await currentSubscription(req.params.storeId)
    const period = new Date().toISOString().slice(0, 7)
    const usage = (await query('select submissions from usage_counters where store_id = $1 and period = $2', [req.params.storeId, period])).rows[0]?.submissions ?? 0
    res.json({ store: serializeStore(config.store, config.rewards, config.tiers), subscription: subscriptionSummary(sub, usage) })
  } catch (error) {
    next(error)
  }
})

router.patch('/stores/:storeId', requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const allowed = {
      name: 'name', subtitle: 'subtitle', logoUrl: 'logo_url', primaryColor: 'primary_color',
      secondaryColor: 'secondary_color', googleReviewUrl: 'google_review_url',
      campaignBadge: 'campaign_badge', minSpinAmount: 'min_spin_amount',
    }
    const sets = []
    const values = []
    for (const [key, column] of Object.entries(allowed)) {
      if (req.body?.[key] !== undefined) {
        values.push(req.body[key])
        sets.push(`${column} = $${values.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No changes supplied.' })
    values.push(req.params.storeId)
    await query(`update stores set ${sets.join(', ')}, updated_at = now() where id = $${values.length}`, values)
    const config = await loadStoreConfig(req.params.storeId)
    res.json(serializeStore(config.store, config.rewards, config.tiers))
  } catch (error) {
    next(error)
  }
})

// --- rewards ----------------------------------------------------------------

router.post('/stores/:storeId/rewards', requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const { rows } = await query(
      `insert into rewards (store_id, name, wheel_label, description, voucher_amount, claim_code_prefix, validity_text, terms, active, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        req.params.storeId, String(req.body?.name ?? '').trim() || 'New reward',
        req.body?.wheelLabel ?? null, req.body?.description ?? null,
        req.body?.voucherAmount ?? null, req.body?.claimCodePrefix ?? null,
        req.body?.validityText ?? null, req.body?.terms ?? null,
        req.body?.active ?? true, req.body?.sortOrder ?? 99,
      ],
    )
    res.status(201).json(rows[0])
  } catch (error) {
    next(error)
  }
})

router.patch('/stores/:storeId/rewards/:rewardId', requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const allowed = {
      name: 'name', wheelLabel: 'wheel_label', description: 'description',
      voucherAmount: 'voucher_amount', claimCodePrefix: 'claim_code_prefix',
      validityText: 'validity_text', terms: 'terms', active: 'active', sortOrder: 'sort_order',
    }
    const sets = []
    const values = []
    for (const [key, column] of Object.entries(allowed)) {
      if (req.body?.[key] !== undefined) {
        values.push(req.body[key])
        sets.push(`${column} = $${values.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No changes supplied.' })
    values.push(req.params.rewardId, req.params.storeId)
    const { rows } = await query(
      `update rewards set ${sets.join(', ')}, updated_at = now()
        where id = $${values.length - 1} and store_id = $${values.length} returning *`,
      values,
    )
    if (!rows[0]) return res.status(404).json({ error: 'Reward not found' })
    res.json(rows[0])
  } catch (error) {
    next(error)
  }
})

router.delete('/stores/:storeId/rewards/:rewardId', requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const used = await query('select 1 from reward_tiers where reward_id = $1 and store_id = $2', [req.params.rewardId, req.params.storeId])
    if (used.rowCount > 0) {
      return res.status(409).json({ error: 'This reward is assigned to a purchase tier. Reassign the tier first.' })
    }
    const { rowCount } = await query('delete from rewards where id = $1 and store_id = $2', [req.params.rewardId, req.params.storeId])
    if (rowCount === 0) return res.status(404).json({ error: 'Reward not found' })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

// --- tiers ------------------------------------------------------------------

router.put('/stores/:storeId/tiers', requireStoreMember, requireStoreOwner, async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.tiers) ? req.body.tiers : null
    if (!incoming) return res.status(400).json({ error: 'A list of tiers is required.' })
    const rewards = (await query('select * from rewards where store_id = $1', [req.params.storeId])).rows
    const store = (await query('select min_spin_amount from stores where id = $1', [req.params.storeId])).rows[0]

    const normalized = incoming.map((tier, index) => ({
      id: tier.id ?? null,
      min_amount: Number(tier.minAmount),
      max_amount: tier.maxAmount === null || tier.maxAmount === undefined || tier.maxAmount === '' ? null : Number(tier.maxAmount),
      reward_id: tier.rewardId,
      target_segment: Number.isInteger(tier.targetSegment) ? tier.targetSegment : index,
      active: tier.active !== false,
    }))

    const { errors, warnings } = validateTiers(normalized, rewards, store?.min_spin_amount ?? 0)
    if (errors.length > 0) return res.status(400).json({ error: errors[0], errors, warnings })

    await withTransaction(async (client) => {
      await client.query('delete from reward_tiers where store_id = $1', [req.params.storeId])
      for (const tier of normalized) {
        await client.query(
          `insert into reward_tiers (store_id, min_amount, max_amount, reward_id, target_segment, active)
           values ($1,$2,$3,$4,$5,$6)`,
          [req.params.storeId, tier.min_amount, tier.max_amount, tier.reward_id, tier.target_segment, tier.active],
        )
      }
    })

    const config = await loadStoreConfig(req.params.storeId)
    res.json({ store: serializeStore(config.store, config.rewards, config.tiers), warnings })
  } catch (error) {
    next(error)
  }
})

// --- submissions ------------------------------------------------------------

function submissionRow(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    purchaseAmount: row.purchase_amount,
    rewardLabel: row.reward_label,
    rewardDescription: row.reward_description,
    rewardVoucherAmount: row.reward_voucher_amount,
    rewardValidityText: row.reward_validity_text,
    claimCode: row.claim_code,
    collectionStatus: row.collection_status,
    collectedAt: row.collected_at,
    reviewCtaClicked: row.review_cta_clicked,
    createdAt: row.created_at,
  }
}

router.get('/stores/:storeId/submissions', requireStoreMember, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const search = String(req.query.search ?? '').trim()
    const status = String(req.query.status ?? '').trim()
    const reward = String(req.query.reward ?? '').trim()
    const from = String(req.query.from ?? '').trim()
    const to = String(req.query.to ?? '').trim()
    const minAmount = req.query.minAmount ? Number(req.query.minAmount) : null
    const maxAmount = req.query.maxAmount ? Number(req.query.maxAmount) : null

    const where = ['store_id = $1']
    const values = [req.params.storeId]
    if (search) {
      values.push(`%${search}%`)
      where.push(`(customer_name ilike $${values.length} or customer_phone ilike $${values.length} or claim_code ilike $${values.length})`)
    }
    if (status === 'awaiting' || status === 'collected') {
      values.push(status)
      where.push(`collection_status = $${values.length}`)
    }
    if (reward) {
      values.push(reward)
      where.push(`reward_label = $${values.length}`)
    }
    if (from) {
      values.push(from)
      where.push(`created_at >= $${values.length}::date`)
    }
    if (to) {
      values.push(to)
      where.push(`created_at < ($${values.length}::date + interval '1 day')`)
    }
    if (Number.isFinite(minAmount)) {
      values.push(minAmount)
      where.push(`purchase_amount >= $${values.length}`)
    }
    if (Number.isFinite(maxAmount)) {
      values.push(maxAmount)
      where.push(`purchase_amount <= $${values.length}`)
    }
    const clause = where.join(' and ')

    const count = await query(`select count(*)::int as total from submissions where ${clause}`, values)
    const total = count.rows[0].total
    const offset = (page - 1) * pageSize
    const rows = await query(
      `select * from submissions where ${clause} order by created_at desc limit ${pageSize} offset ${offset}`,
      values,
    )
    res.json({
      items: rows.rows.map(submissionRow),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/stores/:storeId/submissions/export.csv', requireStoreMember, async (req, res, next) => {
  try {
    const sub = await currentSubscription(req.params.storeId)
    if (!sub?.csv_export) {
      return res.status(403).json({ error: 'CSV export is available on the Growth plan and above.' })
    }
    const rows = await query('select * from submissions where store_id = $1 order by created_at desc', [req.params.storeId])
    const header = ['Name', 'Phone', 'Purchase Amount', 'Reward', 'Claim Code', 'Status', 'Submitted At']
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [header.join(',')]
    for (const row of rows.rows) {
      lines.push([
        row.customer_name, row.customer_phone, row.purchase_amount, row.reward_label,
        row.claim_code, row.collection_status, new Date(row.created_at).toISOString(),
      ].map(escape).join(','))
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"')
    res.send(lines.join('\n'))
  } catch (error) {
    next(error)
  }
})

router.get('/stores/:storeId/stats', requireStoreMember, async (req, res, next) => {
  try {
    const { rows } = await query(
      `select
         count(*)::int as total_entries,
         coalesce(sum(purchase_amount), 0)::bigint as total_purchase_value,
         count(*) filter (where collection_status = 'awaiting')::int as awaiting_collection,
         count(*) filter (where collection_status = 'collected')::int as collected,
         count(distinct customer_phone)::int as total_customers
       from submissions where store_id = $1`,
      [req.params.storeId],
    )
    const recent = await query(
      'select * from submissions where store_id = $1 order by created_at desc limit 5',
      [req.params.storeId],
    )
    const distribution = await query(
      `select reward_label, count(*)::int as count from submissions where store_id = $1 group by reward_label order by count desc`,
      [req.params.storeId],
    )
    const stats = rows[0]
    res.json({
      totalEntries: stats.total_entries,
      totalPurchaseValue: Number(stats.total_purchase_value),
      totalCustomers: stats.total_customers,
      awaitingCollection: stats.awaiting_collection,
      collected: stats.collected,
      recentEntries: recent.rows.map(submissionRow),
      rewardDistribution: distribution.rows.map((r) => ({ label: r.reward_label, count: r.count })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/stores/:storeId/submissions/:submissionId/collect', requireStoreMember, async (req, res, next) => {
  try {
    // Guard against duplicate collection: only an awaiting row can be collected.
    const { rows } = await query(
      `update submissions set collection_status = 'collected', collected_at = now(), collected_by = $1
        where id = $2 and store_id = $3 and collection_status = 'awaiting' returning *`,
      [req.user.id, req.params.submissionId, req.params.storeId],
    )
    if (!rows[0]) {
      const existing = await query('select collection_status from submissions where id = $1 and store_id = $2', [req.params.submissionId, req.params.storeId])
      if (!existing.rows[0]) return res.status(404).json({ error: 'Customer record not found' })
      return res.status(409).json({ error: 'This gift has already been marked as collected.' })
    }
    res.json(submissionRow(rows[0]))
  } catch (error) {
    next(error)
  }
})

export { loadStoreConfig, submissionRow }
export default router
