import { Router } from 'express'
import { query } from '../db.js'
import { requirePlatformAdmin } from '../auth.js'

const router = Router()
router.use(requirePlatformAdmin)

async function audit(actorUserId, action, targetType, targetId, metadata = {}) {
  await query(
    'insert into audit_logs (actor_user_id, action, target_type, target_id, metadata) values ($1,$2,$3,$4,$5)',
    [actorUserId, action, targetType, targetId, metadata],
  )
}

router.get('/metrics', async (_req, res, next) => {
  try {
    const stores = (await query('select count(*)::int as c from stores')).rows[0].c
    const byStatus = (await query(
      `select status, count(*)::int as count from (
         select distinct on (store_id) store_id, status from subscriptions order by store_id, created_at desc
       ) latest group by status`,
    )).rows
    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.count]))
    const mrr = (await query(
      `select coalesce(sum(p.price_inr), 0)::int as mrr from (
         select distinct on (store_id) store_id, plan_id, status from subscriptions order by store_id, created_at desc
       ) latest join plans p on p.id = latest.plan_id where latest.status = 'active'`,
    )).rows[0].mrr
    const expiringTrials = (await query(
      `select count(*)::int as c from (
         select distinct on (store_id) store_id, status, trial_ends_at from subscriptions order by store_id, created_at desc
       ) latest where latest.status = 'trialing' and latest.trial_ends_at < now() + interval '7 days'`,
    )).rows[0].c
    const recentActivity = (await query(
      `select s.id, s.name, s.slug, s.created_at, sub.status as subscription_status, sub.plan_id
         from stores s
         left join lateral (select * from subscriptions where store_id = s.id order by created_at desc limit 1) sub on true
        order by s.created_at desc limit 10`,
    )).rows
    const totalSubmissions = (await query('select count(*)::int as c from submissions')).rows[0].c
    res.json({
      totalStores: stores,
      active: statusMap.active ?? 0,
      trialing: statusMap.trialing ?? 0,
      pastDue: statusMap.past_due ?? 0,
      cancelled: statusMap.cancelled ?? 0,
      expired: statusMap.expired ?? 0,
      suspended: statusMap.suspended ?? 0,
      mrrInr: mrr,
      expiringTrials,
      totalSubmissions,
      recentActivity,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/stores', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim()
    const values = []
    let where = ''
    if (search) {
      values.push(`%${search}%`)
      where = `where s.name ilike $1 or s.slug ilike $1`
    }
    const { rows } = await query(
      `select s.*, sub.status as subscription_status, sub.plan_id, sub.trial_ends_at, sub.current_period_end,
              (select count(*)::int from submissions where store_id = s.id) as submission_count
         from stores s
         left join lateral (select * from subscriptions where store_id = s.id order by created_at desc limit 1) sub on true
         ${where}
        order by s.created_at desc`,
      values,
    )
    res.json({ stores: rows })
  } catch (error) {
    next(error)
  }
})

router.get('/stores/:storeId', async (req, res, next) => {
  try {
    const store = (await query('select * from stores where id = $1', [req.params.storeId])).rows[0]
    if (!store) return res.status(404).json({ error: 'Store not found' })
    const subscription = (await query(
      `select sub.*, p.name as plan_name, p.price_inr from subscriptions sub
         join plans p on p.id = sub.plan_id where sub.store_id = $1 order by sub.created_at desc limit 1`,
      [req.params.storeId],
    )).rows[0] ?? null
    const members = (await query(
      `select m.role, pr.email, pr.full_name from store_members m join profiles pr on pr.id = m.user_id where m.store_id = $1`,
      [req.params.storeId],
    )).rows
    const events = (await query(
      'select * from billing_events where store_id = $1 order by processed_at desc limit 25',
      [req.params.storeId],
    )).rows
    res.json({ store, subscription, members, billingEvents: events })
  } catch (error) {
    next(error)
  }
})

router.patch('/stores/:storeId', async (req, res, next) => {
  try {
    const storeId = req.params.storeId
    const actions = []

    if (req.body?.status === 'active' || req.body?.status === 'suspended') {
      await query('update stores set status = $1, updated_at = now() where id = $2', [req.body.status, storeId])
      actions.push(`status=${req.body.status}`)
    }

    if (req.body?.subscriptionStatus) {
      const allowed = ['trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended']
      if (!allowed.includes(req.body.subscriptionStatus)) return res.status(400).json({ error: 'Unknown subscription status.' })
      await query(
        `update subscriptions set status = $1, updated_at = now() where id = (
           select id from subscriptions where store_id = $2 order by created_at desc limit 1)`,
        [req.body.subscriptionStatus, storeId],
      )
      actions.push(`subscription=${req.body.subscriptionStatus}`)
    }

    if (req.body?.planId) {
      const plan = (await query('select 1 from plans where id = $1', [req.body.planId])).rows[0]
      if (!plan) return res.status(400).json({ error: 'Unknown plan.' })
      await query(
        `update subscriptions set plan_id = $1, updated_at = now() where id = (
           select id from subscriptions where store_id = $2 order by created_at desc limit 1)`,
        [req.body.planId, storeId],
      )
      actions.push(`plan=${req.body.planId}`)
    }

    if (req.body?.extendTrialDays) {
      const days = Math.max(0, Math.min(365, Number(req.body.extendTrialDays)))
      await query(
        `update subscriptions
            set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + ($1 || ' days')::interval,
                status = 'trialing', updated_at = now()
          where id = (select id from subscriptions where store_id = $2 order by created_at desc limit 1)`,
        [days, storeId],
      )
      actions.push(`trial+${days}d`)
    }

    if (actions.length === 0) return res.status(400).json({ error: 'No changes supplied.' })
    await audit(req.user.id, 'platform.store.update', 'store', storeId, { actions })
    res.json({ ok: true, actions })
  } catch (error) {
    next(error)
  }
})

router.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await query('select * from plans order by sort_order asc')
    res.json({ plans: rows })
  } catch (error) {
    next(error)
  }
})

router.patch('/plans/:planId', async (req, res, next) => {
  try {
    const allowed = {
      name: 'name', priceInr: 'price_inr', maxStores: 'max_stores',
      maxSubmissionsPerMonth: 'max_submissions_per_month', csvExport: 'csv_export',
      trialDays: 'trial_days', active: 'active',
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
    values.push(req.params.planId)
    const { rows } = await query(`update plans set ${sets.join(', ')}, updated_at = now() where id = $${values.length} returning *`, values)
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' })
    await audit(req.user.id, 'platform.plan.update', 'plan', req.params.planId, req.body)
    res.json(rows[0])
  } catch (error) {
    next(error)
  }
})

router.get('/billing-events', async (_req, res, next) => {
  try {
    const { rows } = await query('select * from billing_events order by processed_at desc limit 100')
    res.json({ events: rows })
  } catch (error) {
    next(error)
  }
})

router.get('/audit-logs', async (_req, res, next) => {
  try {
    const { rows } = await query('select * from audit_logs order by created_at desc limit 100')
    res.json({ logs: rows })
  } catch (error) {
    next(error)
  }
})

export default router
