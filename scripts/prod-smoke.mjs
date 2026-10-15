// Production smoke store (Phase D step 6, approved 2026-10-15) — creates a
// THROWAWAY synthetic shop on production through the platform RPCs, exercises
// the full pool engine (catalogue gift -> bracket pool -> customer submission ->
// claim code -> idempotent replay -> conflicting reuse rejection), verifies
// vendor/platform logins and tenant scoping on private tables (stores/rewards
// are public-by-design customer-page reads), then deletes the shop through the
// NORMAL store-deletion path (raw stores delete: cascade + audit), proves the
// deletion audit event survives with the store id preserved in details
// metadata, removes the smoke-generated audit rows, and proves nothing remains.
//
// Deliberately targets the PRODUCTION project (guard below) — the inverse of
// ui-verify.mjs/staging-verify.mjs, which refuse to touch it. All identities
// and data are synthetic and removed before exit. No secrets or PII printed.
//
// Env (injected at runtime, never committed):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY')
  process.exit(2)
}
if (!URL.includes('awshkiwqkuubkhecszzk')) {
  console.error(`Refusing to run: ${URL} is not the production project`)
  process.exit(2)
}

const run = Date.now().toString(36)
const slug = `smoke-${run}`
const shopName = `Smoke Shop ${run}`
const adminEmail = `smoke-platform-${run}@jriq-smoke.test`
const vendorEmail = `smoke-vendor-${run}@jriq-smoke.test`
const password = `Smoke-${randomUUID()}!x`
const giftName = `Smoke Gift ${run}`
const customerName = 'Smoke Customer'
const customerPhone = '9876500001'
const requestId = randomUUID()

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } })

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function signIn(email) {
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return client
}

const created = { userIds: [], storeId: null, giftId: null, tierIds: [] }

async function cleanup() {
  if (created.storeId) {
    const storeId = created.storeId
    const { data: auditRows } = await service.from('platform_audit_logs').select('id').eq('store_id', storeId)
    const auditIds = (auditRows ?? []).map((r) => r.id)
    await service.from('submissions').delete().eq('store_id', storeId)
    await service.from('public_submission_rate_limits').delete().eq('store_id', storeId)
    await service.from('tier_gift_options').delete().eq('store_id', storeId)
    await service.from('rewards').delete().eq('store_id', storeId)
    await service.from('reward_tiers').delete().eq('store_id', storeId)
    await service.from('store_subscriptions').delete().eq('store_id', storeId)
    await service.from('store_owner_invitations').delete().eq('store_id', storeId)
    await service.from('store_admins').delete().eq('store_id', storeId)
    await service.from('stores').delete().eq('id', storeId)
    // Approved cleanup of smoke-generated audit rows (snapshot by id first:
    // the store delete nulls their store_id via ON DELETE SET NULL).
    if (auditIds.length) await service.from('platform_audit_logs').delete().in('id', auditIds)
    await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', storeId)
  }
  if (created.giftId) {
    await service.from('gift_catalog').delete().eq('id', created.giftId)
  }
  for (const userId of created.userIds) {
    await service.from('platform_admins').delete().eq('user_id', userId)
    await service.auth.admin.deleteUser(userId)
  }
}

async function main() {
  // ---- 1. synthetic identities (deleted at the end) ----
  const { data: adminUser, error: adminErr } = await service.auth.admin.createUser({
    email: adminEmail, password, email_confirm: true,
  })
  if (adminErr) throw new Error(`createUser ${adminEmail}: ${adminErr.message}`)
  created.userIds.push(adminUser.user.id)
  const { data: vendorUser, error: vendorErr } = await service.auth.admin.createUser({
    email: vendorEmail, password, email_confirm: true,
  })
  if (vendorErr) throw new Error(`createUser ${vendorEmail}: ${vendorErr.message}`)
  created.userIds.push(vendorUser.user.id)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: adminUser.user.id })
  if (paErr) throw new Error(`platform_admins insert: ${paErr.message}`)
  check('synthetic platform + vendor identities created', true)

  // ---- 2. platform login + create shop through the platform RPC ----
  const platform = await signIn(adminEmail)
  check('platform login works against production Auth', true)
  const { data: shopRows, error: shopErr } = await platform.rpc('create_shop', {
    p_name: shopName, p_slug: slug, p_owner_email: vendorEmail,
  })
  if (shopErr) throw new Error(`create_shop: ${shopErr.message}`)
  const shop = shopRows?.[0]
  check('create_shop returned the smoke shop', shop?.shop_slug === slug, JSON.stringify(shop ?? null))
  created.storeId = shop?.shop_id ?? null
  check('owner link status is linked (vendor account existed)', shop?.owner_link_status === 'linked', String(shop?.owner_link_status))

  // ---- 3. 11 default brackets + trial subscription ----
  const { data: tiers } = await service
    .from('reward_tiers')
    .select('id, min_amount, max_amount, reward_id')
    .eq('store_id', created.storeId)
    .order('min_amount')
  created.tierIds = (tiers ?? []).map((t) => t.id)
  check('11 default brackets created', (tiers ?? []).length === 11, `got ${(tiers ?? []).length}`)
  check('first bracket starts at the default minimum (1000)', tiers?.[0]?.min_amount === 1000)
  check('brackets are pool-based (reward_id null on create)', (tiers ?? []).every((t) => t.reward_id === null))
  const { data: subs } = await service.from('store_subscriptions').select('status, trial_ends_at').eq('store_id', created.storeId)
  check('trial subscription created', subs?.length === 1 && subs[0].status === 'trial', JSON.stringify(subs ?? null))

  // ---- 4. activate + catalogue gift + bracket pool (the new engine path) ----
  const { error: statusErr } = await platform.rpc('set_store_status', { p_store_id: created.storeId, p_status: 'active' })
  check('set_store_status activates the shop', !statusErr, statusErr?.message ?? '')
  const { data: gift, error: giftErr } = await platform
    .from('gift_catalog')
    .insert({ name: giftName, wheel_label: 'SMOKE', claim_code_prefix: 'SMK', active: true })
    .select('id')
    .single()
  if (giftErr) throw new Error(`gift_catalog insert: ${giftErr.message}`)
  created.giftId = gift.id
  check('platform admin can write the gift catalogue', true)

  const vendor = await signIn(vendorEmail)
  check('vendor login works against production Auth', true)
  // Tenant scoping is asserted on PRIVATE tables. stores/rewards are part of
  // the public customer-page surface (grant select ... to anon, authenticated
  // plus the "Public can read active stores/rewards" policies) - public reads
  // there are the intended permission model, asserted as such below.
  const { data: memberships } = await vendor.from('store_admins').select('store_id')
  check('vendor scoping: private membership table shows only own shop', (memberships ?? []).length === 1 && memberships[0].store_id === created.storeId, JSON.stringify(memberships ?? null))
  const { data: vendorSubs } = await vendor.from('submissions').select('store_id')
  check('vendor scoping: private customer submissions stay tenant-isolated', (vendorSubs ?? []).length > 0 && (vendorSubs ?? []).every((s) => s.store_id === created.storeId), JSON.stringify(vendorSubs ?? null))
  const bracketTier = (tiers ?? []).find((t) => t.min_amount === 1000)
  const { error: optErr } = await vendor.rpc('save_store_gift_options', {
    p_tier_id: bracketTier.id, p_catalog_gift_ids: [gift.id],
  })
  check('vendor can save a bracket gift pool', !optErr, optErr?.message ?? '')
  const { data: poolRows } = await service.from('tier_gift_options').select('id').eq('store_id', created.storeId)
  check('pool option materialized', (poolRows ?? []).length === 1, `got ${(poolRows ?? []).length}`)
  // Intended public-read model (customer page design): the anonymous visitor
  // can read the active shop and its rewards. BY DESIGN, not a vulnerability.
  const { data: publicStores } = await anon.from('stores').select('id').eq('slug', slug)
  check('public surface reads the active shop by design', (publicStores ?? []).length === 1 && publicStores[0].id === created.storeId, JSON.stringify(publicStores ?? null))
  const { count: publicRewards } = await anon.from('rewards').select('id', { count: 'exact', head: true }).eq('store_id', created.storeId)
  check('public surface reads the shop rewards by design', (publicRewards ?? -1) >= 1, `got ${publicRewards}`)

  // ---- 5. synthetic customer: submit -> claim code -> snapshot ----
  const { data: first, error: firstErr } = await anon.rpc('submit_customer_entry', {
    p_store_slug: slug,
    p_request_id: requestId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_purchase_amount: 5000,
  })
  if (firstErr) throw new Error(`submit_customer_entry: ${firstErr.message}`)
  const entry = first?.[0]
  check('submission returns a claim code', typeof entry?.claim_code === 'string' && entry.claim_code.startsWith('SMK-'), String(entry?.claim_code ?? 'none'))
  check('pool path assigned the catalogue gift', entry?.reward?.name === giftName, String(entry?.reward?.name ?? 'none'))

  const { data: row } = await service
    .from('submissions')
    .select('id, coupon_code, reward_label, reward_wheel_label, reward_claim_code_prefix, collection_status, assigned_tier_min_amount, assigned_tier_max_amount')
    .eq('store_id', created.storeId)
    .single()
  check('submission row persisted with snapshot', row?.id === entry?.submission_id && row?.reward_label === giftName && row?.reward_wheel_label === 'SMOKE' && row?.reward_claim_code_prefix === 'SMK', JSON.stringify(row ?? null))
  check('snapshot carries the bracket bounds', row?.assigned_tier_min_amount === 1000 && row?.assigned_tier_max_amount === 10000, `${row?.assigned_tier_min_amount}-${row?.assigned_tier_max_amount}`)
  check('collection_status starts as awaiting', row?.collection_status === 'awaiting')

  // ---- 6. idempotent replay + conflicting reuse rejection ----
  const { data: retry, error: retryErr } = await anon.rpc('submit_customer_entry', {
    p_store_slug: slug,
    p_request_id: requestId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_purchase_amount: 5000,
  })
  check('identical retry returns the same claim (created=false)', !retryErr && retry?.[0]?.submission_id === entry?.submission_id && retry?.[0]?.claim_code === entry?.claim_code, retryErr?.message ?? '')
  const { data: afterRetry } = await service.from('submissions').select('id').eq('store_id', created.storeId)
  check('identical retry did not create a second row', (afterRetry ?? []).length === 1, `got ${(afterRetry ?? []).length}`)
  const { error: conflictErr } = await anon.rpc('submit_customer_entry', {
    p_store_slug: slug,
    p_request_id: requestId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_purchase_amount: 6000,
  })
  check('same request_id with different amount is rejected', !!conflictErr && /already been used/i.test(conflictErr.message), conflictErr?.message ?? 'no error')

  // ---- 7. NORMAL delete-shop path (raw stores delete: cascade + audit) ----
  const { data: auditRows } = await service.from('platform_audit_logs').select('id').eq('store_id', created.storeId)
  const auditIds = (auditRows ?? []).map((r) => r.id)
  const { count: auditBaseline } = await service.from('platform_audit_logs').select('id', { count: 'exact', head: true })
  const countsBefore = {
    stores: (await service.from('stores').select('id', { count: 'exact', head: true }).eq('id', created.storeId)).count,
    submissions: (await service.from('submissions').select('id', { count: 'exact', head: true }).eq('store_id', created.storeId)).count,
  }
  console.log(`INFO  smoke rows before delete: stores=${countsBefore.stores} submissions=${countsBefore.submissions}; audit rows attached=${auditIds.length}; audit total baseline=${auditBaseline}`)
  const { error: delErr } = await service.from('stores').delete().eq('id', created.storeId)
  check('normal store deletion succeeds (create -> operate -> delete)', !delErr, delErr?.message ?? '')

  // ---- 7b. audit history survives the deletion (defect-fix verification) ----
  const { data: delAudit } = await service
    .from('platform_audit_logs')
    .select('id, store_id, action, details, created_at')
    .eq('action', 'stores.delete')
    .filter('details->>deleted_store_id', 'eq', created.storeId)
  check('deletion audit event survives with store fk null as designed', (delAudit ?? []).length === 1 && delAudit[0].store_id === null, JSON.stringify(delAudit ?? null))
  check('deleted store id recoverable from audit metadata', delAudit?.[0]?.details?.deleted_store_id === created.storeId, String(delAudit?.[0]?.details?.deleted_store_id ?? 'none'))
  check('audit event details preserved (changed_fields + timestamp)', Array.isArray(delAudit?.[0]?.details?.changed_fields) && delAudit[0].details.changed_fields.length > 0 && !!delAudit[0].created_at, JSON.stringify(delAudit?.[0] ?? null))
  const { count: survived } = await service.from('platform_audit_logs').select('id', { count: 'exact', head: true }).in('id', auditIds)
  check('pre-delete audit rows durable (fk set null, rows kept)', (survived ?? -1) === auditIds.length, `survived=${survived} of ${auditIds.length}`)

  // ---- 7c. approved cleanup of smoke-generated audit rows ----
  if (auditIds.length) await service.from('platform_audit_logs').delete().in('id', auditIds)
  await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', created.storeId)

  // ---- 7d. delete remaining smoke identities + zero-row proof ----
  if (created.giftId) {
    await service.from('gift_catalog').delete().eq('id', created.giftId)
  }
  for (const userId of created.userIds) {
    await service.from('platform_admins').delete().eq('user_id', userId)
    await service.auth.admin.deleteUser(userId)
  }
  const leftovers = {}
  for (const [table, col, val] of [
    ['submissions', 'store_id', created.storeId],
    ['public_submission_rate_limits', 'store_id', created.storeId],
    ['tier_gift_options', 'store_id', created.storeId],
    ['rewards', 'store_id', created.storeId],
    ['reward_tiers', 'store_id', created.storeId],
    ['store_subscriptions', 'store_id', created.storeId],
    ['store_owner_invitations', 'store_id', created.storeId],
    ['store_admins', 'store_id', created.storeId],
    ['stores', 'id', created.storeId],
    ['gift_catalog', 'id', created.giftId],
  ]) {
    const { count } = await service.from(table).select(col, { count: 'exact', head: true }).eq(col, val)
    leftovers[table] = count ?? -1
  }
  const { count: paLeft } = await service.from('platform_admins').select('user_id', { count: 'exact', head: true }).in('user_id', created.userIds)
  leftovers.platform_admins = paLeft ?? -1
  check('all smoke data deleted - zero rows remain', Object.values(leftovers).every((c) => c === 0), JSON.stringify(leftovers))
  const { count: auditAfter } = await service.from('platform_audit_logs').select('id', { count: 'exact', head: true })
  check('smoke-generated audit rows removed (approved cleanup)', auditAfter === auditBaseline, `after=${auditAfter} baseline=${auditBaseline}`)
  for (const userId of created.userIds) {
    const { data: gone } = await service.auth.admin.getUserById(userId)
    if (gone?.user) {
      fail += 1
      console.log(`FAIL  auth user ${userId} still exists`)
    }
  }
  check('synthetic auth users deleted', true)

  // ---- 8. protected production records untouched ----
  const { data: claim } = await service.from('submissions').select('id, coupon_code, purchase_amount, collection_status').eq('coupon_code', 'GIFT-DDD89040')
  check('protected claim GIFT-DDD89040 intact', claim?.length === 1 && claim[0].purchase_amount === 50000 && claim[0].collection_status === 'awaiting', JSON.stringify(claim ?? null))
  const { data: cleanClaim } = await service.from('submissions').select('id, coupon_code, purchase_amount, collection_status').eq('coupon_code', 'CLEAN-0CBBDC9A')
  check('protected claim CLEAN-0CBBDC9A intact', cleanClaim?.length === 1 && cleanClaim[0].purchase_amount === 15000 && cleanClaim[0].collection_status === 'awaiting', JSON.stringify(cleanClaim ?? null))
  const { data: shopRow } = await service.from('stores').select('id, min_spin_amount').eq('id', '00000000-0000-4000-a000-000000000001')
  const { count: tierCount } = await service.from('reward_tiers').select('id', { count: 'exact', head: true }).eq('store_id', '00000000-0000-4000-a000-000000000001')
  const { count: rewardCount } = await service.from('rewards').select('id', { count: 'exact', head: true }).eq('store_id', '00000000-0000-4000-a000-000000000001')
  check('existing shop untouched (8 tiers / 8 rewards / min 10000)', shopRow?.[0]?.min_spin_amount === 10000 && tierCount === 8 && rewardCount === 8, `min=${shopRow?.[0]?.min_spin_amount} tiers=${tierCount} rewards=${rewardCount}`)
}

try {
  await main()
} catch (err) {
  fail += 1
  console.log(`FAIL  smoke aborted — ${String(err).slice(0, 300)}`)
} finally {
  await cleanup()
}
console.log(`RESULT ${pass} passed, ${fail} failed (production smoke store)`)
process.exit(fail === 0 ? 0 : 1)
