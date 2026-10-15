// Staging proof for the audit-delete fix migration
// (supabase/migrations/20261015192000_audit_delete_ref_fix.sql), per the
// authorised audit-trigger fix plan (2026-10-15) section 5.
//
// Runs ONLY against the staging project (guard below). For each of TWO fresh
// synthetic shops it executes the supported create-shop workflow, performs
// harmless operations (activate, bracket pool, one synthetic customer entry),
// probes the direct child-DELETE paths with the store ALIVE (the fix must NOT
// detach valid store references), then deletes the shop through the NORMAL
// store-deletion path (raw stores delete: cascade + audit triggers firing) and
// asserts the ten acceptance conditions, including audit-row survival with
// store_id NULL and the deleted store id recoverable from details metadata.
//
// No trigger skipping, no replication-role bypass, no direct audit deletion
// until the approved cleanup section at the end. No secrets or PII printed.
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
if (!URL.includes('wpytaorgiqkfnifsuhax')) {
  console.error(`Refusing to run: ${URL} is not the staging project`)
  process.exit(2)
}

const run = Date.now().toString(36)
const adminEmail = `auditfix-platform-${run}@jriq-smoke.test`
const vendorEmail = `auditfix-vendor-${run}@jriq-smoke.test`
const password = `AuditFix-${randomUUID()}!x`

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

const created = { userIds: [], storeIds: [], giftIds: [], auditShopIds: [] }

async function cleanup() {
  for (const storeId of created.storeIds) {
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
    if (auditIds.length) await service.from('platform_audit_logs').delete().in('id', auditIds)
    await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', storeId)
  }
  for (const giftId of created.giftIds) {
    await service.from('gift_catalog').delete().eq('id', giftId)
  }
  for (const userId of created.userIds) {
    await service.from('platform_admins').delete().eq('user_id', userId)
    await service.auth.admin.deleteUser(userId)
  }
}

async function childCounts(storeId) {
  const out = {}
  for (const [table, col] of [
    ['submissions', 'store_id'],
    ['public_submission_rate_limits', 'store_id'],
    ['tier_gift_options', 'store_id'],
    ['rewards', 'store_id'],
    ['reward_tiers', 'store_id'],
    ['store_subscriptions', 'store_id'],
    ['store_owner_invitations', 'store_id'],
    ['store_admins', 'store_id'],
    ['stores', 'id'],
  ]) {
    const { count } = await service.from(table).select(col, { count: 'exact', head: true }).eq(col, storeId)
    out[table] = count ?? -1
  }
  return out
}

async function createShop(platform, vendor, tag) {
  const slug = `auditfix-${tag}-${run}`
  const { data: shopRows, error: shopErr } = await platform.rpc('create_shop', {
    p_name: `Audit Fix Shop ${tag} ${run}`, p_slug: slug, p_owner_email: vendorEmail,
  })
  if (shopErr) throw new Error(`create_shop: ${shopErr.message}`)
  const shop = shopRows?.[0]
  created.storeIds.push(shop.shop_id)
  return { id: shop.shop_id, slug }
}

async function main() {
  // ---- synthetic identities (removed at the end) ----
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

  const platform = await signIn(adminEmail)
  const vendor = await signIn(vendorEmail)
  check('platform + vendor sign in on staging', true)
  const { data: baselineStores } = await service.from('stores').select('id, slug, name, min_spin_amount')
  const baselineList = baselineStores ?? []
  const baselineCounts = {}
  for (const [table, col] of [['submissions', 'id'], ['store_admins', 'id'], ['rewards', 'id'], ['reward_tiers', 'id']]) {
    baselineCounts[table] = (await service.from(table).select(col, { count: 'exact', head: true })).count
  }

  // ---- cycle 1: create -> operate -> normal delete ----
  const shopA = await createShop(platform, vendor, 'a')
  const { data: tiersA } = await service.from('reward_tiers').select('id, min_amount, reward_id').eq('store_id', shopA.id).order('min_amount')
  const { data: subsA } = await service.from('store_subscriptions').select('status').eq('store_id', shopA.id)
  check('shop A created with default configuration (11 brackets + trial)', (tiersA ?? []).length === 11 && subsA?.[0]?.status === 'trial', `tiers=${(tiersA ?? []).length} sub=${subsA?.[0]?.status}`)
  await platform.rpc('set_store_status', { p_store_id: shopA.id, p_status: 'active' })
  const { data: giftA, error: giftAErr } = await platform
    .from('gift_catalog')
    .insert({ name: `Audit Fix Gift A ${run}`, wheel_label: 'AFXA', claim_code_prefix: 'AFX', active: true })
    .select('id')
    .single()
  if (giftAErr) throw new Error(`gift_catalog insert: ${giftAErr.message}`)
  created.giftIds.push(giftA.id)
  // Default brackets come from platform_policies.default_brackets
  // (1000-10000, 10000-20000, ... 2000000-null): select by position, not by
  // hard-coded amounts that may not exist.
  const tierA = (tiersA ?? [])[0]
  const { error: optAErr } = await vendor.rpc('save_store_gift_options', {
    p_tier_id: tierA.id, p_catalog_gift_ids: [giftA.id],
  })
  check('shop A harmless operation: bracket pool saved', !optAErr, optAErr?.message ?? '')
  const { data: submitA, error: submitAErr } = await anon.rpc('submit_customer_entry', {
    p_store_slug: shopA.slug,
    p_request_id: randomUUID(),
    p_customer_name: 'Audit Fix Customer',
    p_customer_phone: '9876500002',
    p_purchase_amount: 5000,
  })
  check('shop A harmless operation: synthetic customer entry saved', !submitAErr && submitA?.length === 1, submitAErr?.message ?? '')

  // ---- direct child-DELETE probes with the store ALIVE (vendor actor) ----
  // The fix must NOT detach still-valid store references: these audit rows keep
  // their store_id and carry the acting vendor as actor.
  // Probe deletes the TOP bracket: nothing references it (the gift pool is on
  // the lowest bracket and the synthetic entry lands there too).
  const probeTier = (tiersA ?? []).slice().sort((x, y) => y.min_amount - x.min_amount).find((t) => t.id !== tierA.id)
  if (!probeTier) throw new Error('no probe tier available for the live-store delete probe')
  const { error: tierDelErr } = await vendor.from('reward_tiers').delete().eq('id', probeTier.id)
  check('direct tier delete succeeds with store alive', !tierDelErr, tierDelErr?.message ?? '')
  const { data: tierAudit } = await service.from('platform_audit_logs')
    .select('id, store_id, actor_id, action, details')
    .eq('action', 'reward_tiers.delete')
    .filter('details->>deleted_store_id', 'is', 'null')
    .eq('store_id', shopA.id)
  check('valid store reference NOT detached on live-store delete', (tierAudit ?? []).length >= 1 && tierAudit[0].store_id === shopA.id, JSON.stringify(tierAudit ?? null))
  check('actor preserved on authenticated delete', tierAudit?.[0]?.actor_id === vendorUser.user.id, String(tierAudit?.[0]?.actor_id ?? 'none'))
  const probeAuditId = tierAudit?.[0]?.id ?? null
  const { data: optRows } = await service.from('tier_gift_options').select('id').eq('store_id', shopA.id)
  if (optRows?.length) {
    await vendor.from('tier_gift_options').delete().eq('id', optRows[0].id)
  }
  // Store-less audited table probe: delete a FRESH, unattached catalogue gift.
  // The pool gift stays referenced by the live shop and is correctly NOT
  // deletable while in use (rewards_catalog_gift_id_fkey RESTRICT).
  const { data: probeGift, error: probeGiftErr } = await platform
    .from('gift_catalog')
    .insert({ name: `Audit Fix Probe Gift ${run}`, wheel_label: 'AFXP', claim_code_prefix: 'AXP', active: true })
    .select('id')
    .single()
  if (probeGiftErr) throw new Error(`gift_catalog probe insert: ${probeGiftErr.message}`)
  created.giftIds.push(probeGift.id) // tracked so cleanup removes it if the inline delete below fails
  const { error: giftDelErr } = await platform.from('gift_catalog').delete().eq('id', probeGift.id)
  check('catalogue gift delete (no store column) works and audits clean', !giftDelErr, giftDelErr?.message ?? '')
  const { data: giftAudit } = await service.from('platform_audit_logs')
    .select('store_id, action')
    .eq('action', 'gift_catalog.delete')
    .order('created_at', { ascending: false })
    .limit(1)
  check('store-less table audit row carries null store fk', giftAudit?.[0]?.action === 'gift_catalog.delete' && giftAudit?.[0]?.store_id === null, JSON.stringify(giftAudit ?? null))
  const { error: refGiftDelErr } = await platform.from('gift_catalog').delete().eq('id', giftA.id)
  check('referenced catalogue gift correctly refused while in use', !!refGiftDelErr, 'delete unexpectedly succeeded')

  // ---- NORMAL delete of shop A (raw stores delete: cascade + audit) ----
  const { error: delAErr } = await service.from('stores').delete().eq('id', shopA.id)
  check('condition 1/8: normal store deletion succeeds, no FK violation', !delAErr, delAErr?.message ?? '')
  const countsA = await childCounts(shopA.id)
  check('condition 2: store and every child row gone', Object.values(countsA).every((c) => c === 0), JSON.stringify(countsA))
  const { data: delAuditA } = await service.from('platform_audit_logs')
    .select('store_id, action, details, created_at')
    .eq('action', 'stores.delete')
    .filter('details->>deleted_store_id', 'eq', shopA.id)
  check('condition 3: deletion audit event survives', (delAuditA ?? []).length === 1, JSON.stringify(delAuditA ?? null))
  check('condition 4: audit row store fk is null as designed', delAuditA?.[0]?.store_id === null, String(delAuditA?.[0]?.store_id))
  check('condition 5: store id recoverable from audit metadata', delAuditA?.[0]?.details?.deleted_store_id === shopA.id, String(delAuditA?.[0]?.details?.deleted_store_id ?? 'none'))
  check('condition 6: event details preserved (action/fields/timestamp)', delAuditA?.[0]?.action === 'stores.delete' && Array.isArray(delAuditA?.[0]?.details?.changed_fields) && delAuditA[0].details.changed_fields.length > 0 && !!delAuditA[0].created_at, JSON.stringify(delAuditA?.[0] ?? null))
  // condition 7: shop B not yet created at this point -> asserted after cycle 2.

  // ---- cycle 2: repeatability on a second fresh shop (condition 9) ----
  const shopB = await createShop(platform, vendor, 'b')
  const { data: tiersB } = await service.from('reward_tiers').select('id').eq('store_id', shopB.id)
  const { data: subsB } = await service.from('store_subscriptions').select('status').eq('store_id', shopB.id)
  check('shop B created with default configuration (11 brackets + trial)', (tiersB ?? []).length === 11 && subsB?.[0]?.status === 'trial', `tiers=${(tiersB ?? []).length}`)
  const { error: delBErr } = await service.from('stores').delete().eq('id', shopB.id)
  check('condition 9: second normal deletion succeeds too', !delBErr, delBErr?.message ?? '')
  const countsB = await childCounts(shopB.id)
  check('condition 9: second shop fully gone', Object.values(countsB).every((c) => c === 0), JSON.stringify(countsB))
  const { data: delAuditB } = await service.from('platform_audit_logs')
    .select('details')
    .eq('action', 'stores.delete')
    .filter('details->>deleted_store_id', 'eq', shopB.id)
  check('condition 9: second deletion audit event survives', (delAuditB ?? []).length === 1 && delAuditB[0].details?.deleted_store_id === shopB.id, JSON.stringify(delAuditB ?? null))

  // ---- condition 7: no unrelated shop / owner / claim changed ----
  const { data: remaining } = await service.from('stores').select('id, slug, name, min_spin_amount')
  const sameSet = (remaining ?? []).length === baselineList.length
    && (remaining ?? []).every((s) => baselineList.some((b) => b.id === s.id && b.slug === s.slug && b.name === s.name && b.min_spin_amount === s.min_spin_amount))
  check('condition 7: every unrelated shop unchanged, no test shop remains', sameSet, JSON.stringify({ before: baselineList.length, after: (remaining ?? []).length }))
  const countsUnchanged = {}
  for (const [table, col] of [['submissions', 'id'], ['store_admins', 'id'], ['rewards', 'id'], ['reward_tiers', 'id']]) {
    const now = (await service.from(table).select(col, { count: 'exact', head: true })).count
    countsUnchanged[table] = `${baselineCounts[table]}->${now}`
  }
  check('condition 7: unrelated owner/claim/reward rows unchanged in count', Object.entries(countsUnchanged).every(([t, v]) => v.split('->')[0] === v.split('->')[1]), JSON.stringify(countsUnchanged))

  // ---- condition 10: regression surface ----
  // The full reward/idempotency/collection/legacy-fallback/tenant-isolation
  // suite (scripts/staging-verify.mjs) is run separately after this script.
  // Here we prove audit rows written during live-store operations stay durable
  // through the store deletion (fk set null by the ON DELETE SET NULL action).
  if (probeAuditId) {
    const { data: probeRow } = await service.from('platform_audit_logs').select('id, store_id, action').eq('id', probeAuditId)
    check('condition 10: live-store audit row survives store deletion (fk set null)', (probeRow ?? []).length === 1 && probeRow[0].store_id === null, JSON.stringify(probeRow ?? null))
  } else {
    check('condition 10: live-store audit row survives store deletion (fk set null)', false, 'probe audit row id not captured')
  }
}

try {
  await main()
} catch (err) {
  fail += 1
  console.log(`FAIL  audit-fix verification aborted — ${String(err).slice(0, 300)}`)
} finally {
  await cleanup()
}
console.log(`RESULT ${pass} passed, ${fail} failed (staging audit-fix verification)`)
process.exit(fail === 0 ? 0 : 1)
