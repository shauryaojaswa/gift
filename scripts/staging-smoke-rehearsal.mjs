// JRIQ v1.1.0 Phase 3 - prod-smoke PATTERN rehearsed against STAGING.
//
// prod-smoke.mjs is hard-guarded to production (it refuses any other project).
// Before that same pattern runs on production post-deploy, it must pass
// somewhere non-destructive first: this script runs the identical lifecycle on
// the verified staging project -
//   platform-RPC shop creation -> gift -> bracket pool -> customer submission ->
//   claim code -> idempotent replay -> conflicting collection rejection ->
//   vendor/platform login + tenant scoping -> NORMAL store deletion (cascade +
//   audit) -> deletion audit survives with store id preserved in details ->
//   smoke rows removed -> residue zero.
//
// Synthetic data only; everything is removed before exit. Never point at prod.
//
// Usage (PowerShell):
//   $keys = npx.cmd supabase projects api-keys --project-ref wpytaorgiqkfnifsuhax --output json | ConvertFrom-Json
//   $env:SUPABASE_STAGING_URL = 'https://wpytaorgiqkfnifsuhax.supabase.co'
//   $env:SUPABASE_STAGING_ANON_KEY = ($keys | Where-Object name -eq 'anon').api_key
//   $env:SUPABASE_STAGING_SERVICE_KEY = ($keys | Where-Object name -eq 'service_role').api_key
//   node scripts/staging-smoke-rehearsal.mjs
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_STAGING_URL
const ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_STAGING_SERVICE_KEY

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_STAGING_URL / _ANON_KEY / _SERVICE_KEY')
  process.exit(2)
}
if (!URL.includes('wpytaorgiqkfnifsuhax')) {
  console.error(`Refusing to run: ${URL} is not the verified staging project`)
  process.exit(2)
}

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}
async function expectError(name, promise, needle) {
  const { error } = await promise
  if (!error) {
    check(name, false, 'expected an error, got success')
  } else if (needle && !error.message.includes(needle)) {
    check(name, false, `error was: ${error.message}`)
  } else {
    check(name, true)
  }
}

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
const platform = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
const owner = createClient(URL, ANON_KEY, { auth: { persistSession: false } })

const run = Date.now().toString(36)
const runStart = new Date().toISOString()
const passwords = {}
const userIds = []
let storeId = null
let giftId = null
async function makeUser(tag, email) {
  const password = `Rehearse-${run}-${tag}!x`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  userIds.push(data.user.id)
  passwords[email] = password
  return data.user
}
const phoneSeq = () => `${'6789'[Math.floor(Math.random() * 4)]}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

async function main() {
  const adminEmail = `rehearse-admin-${run}@example.com`
  const ownerEmail = `rehearse-owner-${run}@example.com`
  const adminUser = await makeUser('admin', adminEmail)
  await makeUser('owner', ownerEmail)

  const { error: paErr } = await service.from('platform_admins').insert({ user_id: adminUser.id })
  check('seed platform admin', !paErr, paErr?.message)
  for (const [client, email] of [[platform, adminEmail], [owner, ownerEmail]]) {
    const { error } = await client.auth.signInWithPassword({ email, password: passwords[email] })
    check(`vendor/platform login (${email.split('-')[1]})`, !error, error?.message)
  }

  // ---- platform-RPC shop creation ----
  const slug = `rehearse-${run}`
  const { data: shopData, error: shopErr } = await platform.rpc('create_shop', {
    p_name: `Rehearsal Shop ${run}`, p_slug: slug, p_owner_email: ownerEmail,
  })
  check('create_shop via platform RPC', !shopErr && shopData?.length === 1, shopErr?.message)
  const shop = shopData?.[0]
  storeId = shop?.shop_id ?? null
  check('customer_path is root-level', shop?.customer_path === `/${slug}`, shop?.customer_path)
  const { error: actErr } = await platform.rpc('set_store_status', { p_store_id: storeId, p_status: 'active' })
  check('platform activates campaign', !actErr, actErr?.message)

  // ---- gift -> bracket pool ----
  const { data: gift, error: gErr } = await service.from('rewards').insert({
    store_id: storeId,
    name: `Rehearsal Gift ${run}`,
    wheel_label: 'REHEARSE',
    description: 'smoke rehearsal fixture',
    claim_code_prefix: 'RHR',
    validity_text: 'suite fixture',
    active: true,
  }).select().single()
  check('gift created', !gErr && !!gift, gErr?.message)
  giftId = gift?.id ?? null

  const { data: tiers } = await service.from('reward_tiers').select('*').eq('store_id', storeId).order('min_amount')
  const bindRes = await owner.rpc('save_store_tiers', {
    p_tiers: (tiers ?? []).map((t) => ({
      id: t.id, min_amount: t.min_amount, max_amount: t.max_amount,
      reward_id: giftId, target_segment: t.target_segment, active: t.active,
    })),
  })
  check('owner binds gift to bracket pool', !bindRes.error, bindRes.error?.message)

  // ---- customer submission -> claim code -> idempotent replay ----
  const requestId = randomUUID()
  const payload = {
    p_store_slug: slug,
    p_request_id: requestId,
    p_customer_name: 'Rehearsal Customer',
    p_customer_phone: phoneSeq(),
    p_purchase_amount: 15000,
  }
  const { data: draw, error: drawErr } = await anon.rpc('submit_customer_entry', payload)
  check('submission produces a claim code', !drawErr && draw?.length === 1 && !!draw[0].claim_code, drawErr?.message)
  const submissionId = draw?.[0]?.submission_id

  const { data: replay, error: replayErr } = await anon.rpc('submit_customer_entry', payload)
  check('idempotent replay returns the same claim', !replayErr
    && replay?.[0]?.submission_id === submissionId && replay?.[0]?.claim_code === draw?.[0]?.claim_code,
    replayErr?.message ?? JSON.stringify(replay?.[0] ?? null))
  await expectError('same request_id with different amount is rejected', anon.rpc('submit_customer_entry', {
    ...payload,
    p_purchase_amount: 16000,
  }), 'already been used')

  // ---- collection: first collect succeeds, conflicting second is rejected ----
  const { error: colErr } = await owner.rpc('mark_submission_collected', { p_submission_id: submissionId })
  check('owner collects own claim', !colErr, colErr?.message)
  await expectError('conflicting second collection is rejected', owner.rpc('mark_submission_collected', {
    p_submission_id: submissionId,
  }), 'Gift has already been collected')

  // ---- NORMAL store deletion (cascade + audit) ----
  const { error: delErr } = await service.from('stores').delete().eq('id', storeId)
  check('store deleted through the normal path (cascade)', !delErr, delErr?.message)

  const { data: delAudit } = await service.from('platform_audit_logs')
    .select('*')
    .eq('action', 'stores.delete')
    .filter('details->>deleted_store_id', 'eq', storeId)
  check('deletion audit event survives with store fk null as designed',
    (delAudit ?? []).length === 1 && delAudit[0].store_id === null, JSON.stringify(delAudit ?? null))
  const { data: cascadeAudit } = await service.from('platform_audit_logs')
    .select('id, store_id')
    .filter('details->>deleted_store_id', 'eq', storeId)
  check('every cascade deletion event preserves the store id with fk null',
    (cascadeAudit ?? []).length > 0 && (cascadeAudit ?? []).every((a) => a.store_id === null),
    `count=${(cascadeAudit ?? []).length}`)
  check('deleted store id recoverable from audit metadata',
    delAudit?.[0]?.details?.deleted_store_id === storeId, String(delAudit?.[0]?.details?.deleted_store_id ?? 'none'))
  check('audit event details preserved (changed_fields + timestamp)',
    Array.isArray(delAudit?.[0]?.details?.changed_fields) && delAudit[0].details.changed_fields.length > 0 && !!delAudit[0].created_at,
    JSON.stringify(delAudit?.[0] ?? null))
}

async function cleanup() {
  // Approved cleanup order (mirrors prod-smoke): smoke-generated audit rows
  // referencing the deleted store go first, then tenant rows, then auth users.
  if (storeId) {
    await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', storeId)
    await service.from('platform_audit_logs').delete().eq('store_id', storeId)
    await service.from('submissions').delete().eq('store_id', storeId)
    await service.from('public_submission_rate_limits').delete().eq('store_id', storeId)
    await service.from('tier_gift_options').delete().eq('store_id', storeId)
    await service.from('rewards').delete().eq('store_id', storeId)
    await service.from('reward_tiers').delete().eq('store_id', storeId)
    await service.from('store_subscriptions').delete().eq('store_id', storeId)
    await service.from('store_owner_invitations').delete().eq('store_id', storeId)
    await service.from('store_admins').delete().eq('store_id', storeId)
    await service.from('stores').delete().eq('id', storeId)
    if (giftId) await service.from('gift_catalog').delete().eq('id', giftId)

    // Residue zero: nothing may reference the rehearsal store anywhere.
    const tables = ['submissions', 'public_submission_rate_limits', 'tier_gift_options',
      'rewards', 'reward_tiers', 'store_subscriptions', 'store_owner_invitations', 'store_admins']
    for (const table of tables) {
      const { count } = await service.from(table).select('*', { count: 'exact', head: true }).eq('store_id', storeId)
      check(`residue zero: ${table}`, (count ?? 0) === 0, `count=${count}`)
    }
    const { count: storeCount } = await service.from('stores').select('*', { count: 'exact', head: true }).eq('id', storeId)
    check('residue zero: stores', (storeCount ?? 0) === 0, `count=${storeCount}`)
  }
  await service.from('platform_admins').delete().in('user_id', userIds)
  for (const id of userIds) {
    await service.auth.admin.deleteUser(id)
  }
  const { data: lateAudit } = await service.from('platform_audit_logs')
    .select('id').gte('created_at', runStart).filter('details->>deleted_store_id', 'eq', storeId)
  check('no rehearsal audit rows remain', !lateAudit || lateAudit.length === 0, JSON.stringify(lateAudit ?? null))
}

main()
  .catch((err) => {
    fail += 1
    console.error(`FAIL  rehearsal crashed -- ${err?.message ?? err}`)
  })
  .finally(async () => {
    await cleanup()
    console.log(`\nRESULT ${pass} passed, ${fail} failed (prod-smoke pattern vs staging)`)
    process.exit(fail > 0 ? 1 : 0)
  })
