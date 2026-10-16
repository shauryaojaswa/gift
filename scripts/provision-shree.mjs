#!/usr/bin/env node
// Provision the Shree Jewellers shop (slug `shreejwellers`) through the
// established platform/vendor workflows - no direct SQL, no invented data:
//
//   1. owner account            -> auth admin (created only if absent; the
//                                  password is never printed or logged)
//   2. shop                     -> create_shop RPC as a platform admin
//                                  (temporary, self-cleaning, exactly like
//                                  scripts/prod-smoke.mjs's platform actor)
//   3. central gift catalogue   -> gift_catalog insert as platform admin
//   4. bracket gift pools       -> save_store_gift_options RPC as the owner
//   5. shop settings            -> stores update as the owner (min spin 5000,
//                                  configured Google review link)
//   6. activation               -> set_store_status RPC as platform admin
//
// The five purchase brackets are the commissioned Shree Jewellers
// configuration (non-overlapping [min, max) INR brackets, last one unbounded):
//   5,000-14,999  Bag + ₹1,200 Saree Coupon
//   15,000-49,999 three alternatives, each + ₹1,200 Saree Coupon
//   50,000-99,999 Big Bluetooth Speaker or Bluetooth Headband
//   1,00,000-1,99,999 Dinner Set
//   2,00,000+     Mixer Grinder
// Tier 3's prize sheet had a trailing "+" with no legible prize; it is NOT
// interpreted as a prize - only the two readable gifts are configured.
//
// Coupon bundles are complete named prizes (name + wheel label carry the whole
// bundle incl. the ₹1,200 Saree Coupon) so every saved reward snapshot shows
// the complete prize; the description line carries the coupon marker "+ ₹1,200
// Coupon" for the wheel.
//
// Usage:
//   node scripts/provision-shree.mjs --owner-email <email> [--owner-password <pw>]
//                                    [--env staging|production] [--no-activate]
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY in the environment.
//   The password may also come from JRIQ_OWNER_PASSWORD (preferred; never logged).
//
// Idempotent: re-running configures the same end state without duplicating the
// shop, catalogue entries or pools. Exit 0 = every check passed.

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

const URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const OWNER_EMAIL = argValue('--owner-email')
const OWNER_PASSWORD = argValue('--owner-password') || process.env.JRIQ_OWNER_PASSWORD || null
const TARGET_ENV = argValue('--env') || 'staging'
const ACTIVATE = !args.includes('--no-activate')

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const EXPECTED_REF = REF_BY_ENV[TARGET_ENV]

if (!URL || !ANON_KEY || !SERVICE_KEY || !OWNER_EMAIL) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY / --owner-email')
  process.exit(2)
}
if (!EXPECTED_REF || !URL.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${URL} is not the ${TARGET_ENV} project (${EXPECTED_REF})`)
  process.exit(2)
}

const SHOP_SLUG = 'shreejwellers'
const SHOP_NAME = 'Shree Jewellers'
const MIN_SPIN_AMOUNT = 5000
const REVIEW_URL =
  'https://www.google.com/search?hl=en-IN&gl=in&q=PF32%2BCJV+Shree+Jewellers,+Jawaharnagar,+Maharashtra+416115&ludocid=1061963283657064940&lsig=AB86z5WxzN8H7u5nQ49b24LliIAr#lrd=0x3bc11d000be053c1:0xebcd9fadee301ec,3'

const TIERS = [
  { min_amount: 5000, max_amount: 15000, target_segment: 0 },
  { min_amount: 15000, max_amount: 50000, target_segment: 1 },
  { min_amount: 50000, max_amount: 100000, target_segment: 2 },
  { min_amount: 100000, max_amount: 200000, target_segment: 3 },
  { min_amount: 200000, max_amount: null, target_segment: 4 },
]

// Complete named prizes. `description` doubles as the wheel's description
// line (16 chars): "+ ₹1,200 Coupon" keeps the coupon visible on the wheel.
const CATALOG = [
  { key: 'bag', name: 'Bag + ₹1,200 Saree Coupon', description: '+ ₹1,200 Coupon', claim_code_prefix: 'BAG', voucher_value: 1200 },
  { key: 'speaker-s', name: 'Small Bluetooth Speaker + ₹1,200 Saree Coupon', description: '+ ₹1,200 Coupon', claim_code_prefix: 'SPKS', voucher_value: 1200 },
  { key: 'saree', name: 'Saree + ₹1,200 Saree Coupon', description: '+ ₹1,200 Coupon', claim_code_prefix: 'SARE', voucher_value: 1200 },
  { key: 'headband-c', name: 'Bluetooth Headband + ₹1,200 Saree Coupon', description: '+ ₹1,200 Coupon', claim_code_prefix: 'HDBC', voucher_value: 1200 },
  { key: 'speaker-l', name: 'Big Bluetooth Speaker', description: '', claim_code_prefix: 'SPKB', voucher_value: null },
  { key: 'headband', name: 'Bluetooth Headband', description: '', claim_code_prefix: 'HDPN', voucher_value: null },
  { key: 'dinner', name: 'Dinner Set', description: '', claim_code_prefix: 'DINR', voucher_value: null },
  { key: 'mixer', name: 'Mixer Grinder', description: '', claim_code_prefix: 'MIXR', voucher_value: null },
]

// Bracket pools, keyed by bracket minimum. Tier 3 = the two legible gifts only.
const POOLS = {
  5000: ['bag'],
  15000: ['speaker-s', 'saree', 'headband-c'],
  50000: ['speaker-l', 'headband'],
  100000: ['dinner'],
  200000: ['mixer'],
}

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } })

function sessionClient() {
  return createClient(URL, ANON_KEY, { auth: { persistSession: false } })
}

async function signIn(email, password) {
  const client = sessionClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return client
}

async function main() {
  const report = { env: TARGET_ENV, shopSlug: SHOP_SLUG, ownerEmail: OWNER_EMAIL }

  // ---- 1. owner account (created only when absent; password never logged) ----
  let ownerCreated = false
  let ownerId = null
  {
    const { data: existing } = await service.auth.admin.listUsers()
    const found = (existing?.users ?? []).find((u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase())
    if (found) {
      ownerId = found.id
      check('owner account already present (left untouched)', true)
    } else {
      if (!OWNER_PASSWORD) throw new Error('owner account absent and no --owner-password / JRIQ_OWNER_PASSWORD given')
      const { data: created, error } = await service.auth.admin.createUser({
        email: OWNER_EMAIL, password: OWNER_PASSWORD, email_confirm: true,
      })
      if (error) throw new Error(`createUser ${OWNER_EMAIL}: ${error.message}`)
      ownerId = created.user.id
      ownerCreated = true
      check('owner account created (email confirmed)', true)
    }
  }
  report.ownerId = ownerId
  report.ownerAccountCreated = ownerCreated

  // ---- 2. temporary platform admin (same pattern as prod-smoke) ----
  const tempEmail = `shree-onboard-${Date.now().toString(36)}@jriq-smoke.test`
  const tempPassword = `Onboard-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}!x`
  const { data: tempUser, error: tempErr } = await service.auth.admin.createUser({
    email: tempEmail, password: tempPassword, email_confirm: true,
  })
  if (tempErr) throw new Error(`createUser ${tempEmail}: ${tempErr.message}`)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: tempUser.user.id })
  if (paErr) throw new Error(`platform_admins insert: ${paErr.message}`)
  const platform = await signIn(tempEmail, tempPassword)
  check('temporary platform administrator signed in', true)

  try {
    // ---- 3. shop through create_shop (owner exists first -> linked) ----
    const { data: shopRows, error: shopErr } = await platform.rpc('create_shop', {
      p_name: SHOP_NAME,
      p_slug: SHOP_SLUG,
      p_owner_email: OWNER_EMAIL,
      p_tiers: TIERS,
    })
    if (shopErr) throw new Error(`create_shop: ${shopErr.message}`)
    const shop = shopRows?.[0]
    check('create_shop returned the Shree Jewellers shop', shop?.shop_slug === SHOP_SLUG, JSON.stringify(shop ?? null))
    check('owner link status is linked', shop?.owner_link_status === 'linked', String(shop?.owner_link_status))
    const storeId = shop?.shop_id ?? null
    report.storeId = storeId

    // ---- 4. brackets ----
    const { data: tiers, error: tiersErr } = await service
      .from('reward_tiers')
      .select('id, min_amount, max_amount, reward_id, target_segment, active')
      .eq('store_id', storeId)
      .order('min_amount')
    if (tiersErr) throw new Error(tiersErr.message)
    check('five purchase brackets exist', (tiers ?? []).length === 5, `got ${(tiers ?? []).length}`)
    const bracketShape = (tiers ?? []).map((t) => [t.min_amount, t.max_amount])
    check(
      'bracket boundaries exactly match the commissioned configuration',
      JSON.stringify(bracketShape) === JSON.stringify(TIERS.map((t) => [t.min_amount, t.max_amount])),
      JSON.stringify(bracketShape),
    )
    check('brackets are pool-based (reward_id null)', (tiers ?? []).every((t) => t.reward_id === null))

    // ---- 5. central gift catalogue (platform administrative workflow) ----
    const catalogIds = {}
    for (const gift of CATALOG) {
      const { data: existingRows } = await platform
        .from('gift_catalog')
        .select('id, name, wheel_label, description')
        .eq('name', gift.name)
      let row = existingRows?.[0]
      if (!row) {
        const { data: inserted, error: insErr } = await platform
          .from('gift_catalog')
          .insert({
            name: gift.name,
            wheel_label: gift.name,
            description: gift.description,
            claim_code_prefix: gift.claim_code_prefix,
            voucher_value: gift.voucher_value,
            active: true,
          })
          .select('id, name, wheel_label, description')
          .single()
        if (insErr) throw new Error(`gift_catalog insert ${gift.name}: ${insErr.message}`)
        row = inserted
      }
      catalogIds[gift.key] = row.id
      check(`catalogue entry present: ${gift.name}`, row.name === gift.name && row.wheel_label === gift.name)
    }
    report.catalogIds = catalogIds

    // ---- 6. activation: the owner workspace (is_store_admin) unlocks only
    //         once the shop is active (is_store_campaign_active) ----
    if (ACTIVATE) {
      const { error: statusErr } = await platform.rpc('set_store_status', { p_store_id: storeId, p_status: 'active' })
      check('set_store_status activates the shop', !statusErr, statusErr?.message ?? '')
    }
    const { data: afterStatus } = await service.from('stores').select('status').eq('id', storeId).limit(1)
    check('shop status', ACTIVATE ? afterStatus?.[0]?.status === 'active' : true, String(afterStatus?.[0]?.status))
    report.status = afterStatus?.[0]?.status ?? null

    // ---- 7. bracket pools through the owner session (established vendor
    //         workspace workflow) ----
    const owner = await signIn(OWNER_EMAIL, OWNER_PASSWORD ?? undefined)
    check('owner sign-in works', true)
    for (const tier of tiers ?? []) {
      const keys = POOLS[tier.min_amount]
      if (!keys) throw new Error(`no pool configured for bracket ${tier.min_amount}`)
      const ids = keys.map((k) => catalogIds[k])
      const { error: optErr } = await owner.rpc('save_store_gift_options', {
        p_tier_id: tier.id,
        p_catalog_gift_ids: ids,
      })
      if (optErr) throw new Error(`save_store_gift_options bracket ${tier.min_amount}: ${optErr.message}`)
    }
    const { data: poolRows, error: poolErr } = await service
      .from('tier_gift_options')
      .select('tier_id, reward_id, rewards(name, wheel_label, catalog_gift_id)')
      .eq('store_id', storeId)
    if (poolErr) throw new Error(poolErr.message)
    const poolByTier = new Map()
    for (const row of poolRows ?? []) {
      const list = poolByTier.get(row.tier_id) ?? []
      list.push(row.rewards?.name ?? 'Gift')
      poolByTier.set(row.tier_id, list)
    }
    for (const tier of tiers ?? []) {
      const expected = (POOLS[tier.min_amount] ?? []).map((k) => CATALOG.find((g) => g.key === k).name)
      const actual = poolByTier.get(tier.id) ?? []
      check(
        `bracket ₹${tier.min_amount.toLocaleString('en-IN')} pool = ${expected.length} gift(s)`,
        JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
        `got ${JSON.stringify(actual)}`,
      )
    }
    check('bundle pools name the complete prize incl. coupon', (poolRows ?? []).every((row) => {
      const name = row.rewards?.name ?? ''
      return !name.includes('+') || (name.includes('₹1,200 Saree Coupon') && name.includes('+'))
    }))

    // ---- 8. shop settings through the owner session (established updateStore path) ----
    const { error: cfgErr } = await owner
      .from('stores')
      .update({ min_spin_amount: MIN_SPIN_AMOUNT, google_review_url: REVIEW_URL, updated_at: new Date().toISOString() })
      .eq('id', storeId)
    if (cfgErr) throw new Error(`stores settings update: ${cfgErr.message}`)
    const { data: cfgRows } = await service
      .from('stores')
      .select('slug, name, min_spin_amount, google_review_url, status')
      .eq('id', storeId)
      .limit(1)
    const cfg = cfgRows?.[0]
    check('shop identity: Shree Jewellers / shreejwellers', cfg?.slug === SHOP_SLUG && cfg?.name === SHOP_NAME, JSON.stringify(cfg ?? null))
    check('minimum qualifying purchase is ₹5,000', cfg?.min_spin_amount === 5000, String(cfg?.min_spin_amount))
    check('Google review link stored on the shop record', cfg?.google_review_url === REVIEW_URL)
    report.store = cfg ?? null

    // ---- 9. public read-only surface (customer page contract) ----
    const { data: publicShop } = await anon.from('stores').select('id, slug').eq('slug', SHOP_SLUG)
    check('public surface reads the active shop (customer page)', (publicShop ?? []).length === 1, JSON.stringify(publicShop ?? null))
    const { data: publicPool, error: publicPoolErr } = await anon.rpc('get_store_gift_pool', { p_store_slug: SHOP_SLUG })
    check('public gift-pool read returns every bracket pool', !publicPoolErr && (publicPool ?? []).length === 8, `got ${(publicPool ?? []).length} ${publicPoolErr?.message ?? ''}`)
    report.publicPoolCount = (publicPool ?? []).length
  } finally {
    // ---- 10. temporary platform admin cleanup (owner + shop stay) ----
    await service.from('platform_admins').delete().eq('user_id', tempUser.user.id)
    await service.auth.admin.deleteUser(tempUser.user.id)
    check('temporary platform administrator removed', true)
  }

  console.log(`INFO  summary ${JSON.stringify(report)}`)
  console.log(`RESULT ${pass} passed, ${fail} failed (provision shreejwellers on ${TARGET_ENV})`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL  provision aborted - ${err?.message ?? err}`)
  process.exit(1)
})
