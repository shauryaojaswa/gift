import bcrypt from 'bcryptjs'
import { pool, query, withTransaction } from './db.js'
import { migrate } from './migrate.js'
import { insertDefaultConfig, DEFAULT_STORE } from './defaults.js'

const PLATFORM_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@gift.local').toLowerCase()
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? 'admin12345'
const DEMO_OWNER_EMAIL = (process.env.DEMO_OWNER_EMAIL ?? 'owner@demo.local').toLowerCase()
const DEMO_OWNER_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'demo12345'
const DEMO_STORE_SLUG = process.env.DEMO_STORE_SLUG ?? 'jewellers-demo'

async function upsertUser(email, password, fullName, isPlatformAdmin) {
  const passwordHash = await bcrypt.hash(password, 10)
  const { rows } = await query(
    `insert into profiles (email, password_hash, full_name, is_platform_admin)
     values ($1,$2,$3,$4)
     on conflict (lower(email)) do update set password_hash = excluded.password_hash, full_name = excluded.full_name
     returning id`,
    [email, passwordHash, fullName, isPlatformAdmin],
  )
  return rows[0].id
}

async function seed() {
  await migrate()

  const adminId = await upsertUser(PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, 'Platform Admin', true)
  await query('insert into platform_admins (user_id) values ($1) on conflict (user_id) do nothing', [adminId])
  console.log(`platform admin ready: ${PLATFORM_ADMIN_EMAIL}`)

  const ownerId = await upsertUser(DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD, 'Demo Store Owner', false)

  const existing = await query('select id from stores where lower(slug) = $1', [DEMO_STORE_SLUG])
  if (existing.rowCount === 0) {
    await withTransaction(async (client) => {
      // The display name is intentionally left blank until the owner confirms it.
      const { rows } = await client.query(
        `insert into stores (slug, name, subtitle, logo_url, primary_color, secondary_color, campaign_badge, min_spin_amount)
         values ($1,'',$2,$3,$4,$5,$6,$7) returning id`,
        [DEMO_STORE_SLUG, DEFAULT_STORE.subtitle, DEFAULT_STORE.logo_url,
         DEFAULT_STORE.primary_color, DEFAULT_STORE.secondary_color,
         DEFAULT_STORE.campaign_badge, DEFAULT_STORE.min_spin_amount],
      )
      const storeId = rows[0].id
      await client.query('insert into store_members (store_id, user_id, role) values ($1,$2,$3)', [storeId, ownerId, 'owner'])
      await insertDefaultConfig(client, storeId)
      const trialDays = (await client.query("select trial_days from plans where id = 'trial'")).rows[0]?.trial_days ?? 14
      await client.query(
        `insert into subscriptions (store_id, plan_id, status, trial_ends_at)
         values ($1,'trial','trialing', now() + ($2 || ' days')::interval)`,
        [storeId, trialDays],
      )
    })
    console.log(`demo store ready: /store/${DEMO_STORE_SLUG} (owner ${DEMO_OWNER_EMAIL})`)
  } else {
    await query(
      `insert into store_members (store_id, user_id, role) values ($1,$2,'owner') on conflict do nothing`,
      [existing.rows[0].id, ownerId],
    )
    console.log(`demo store already present: /store/${DEMO_STORE_SLUG}`)
  }
}

seed()
  .then(() => pool.end())
  .then(() => console.log('seed complete'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
