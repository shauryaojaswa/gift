// Post-launch smoke (Phase C external-matrix row: "real spin persists a claim
// with code"). Performs EXACTLY ONE synthetic customer spin through the public
// flow (the same anonymous RPC the customer page calls) against the live store,
// verifies the claim code persisted with its reward snapshot, then surgically
// removes its own rows. Read-mostly: the only writes are the single public
// submission and its rate-limit row, both deleted before exit.
//
// Audit safety: submissions INSERT is NOT audited (audit_collection_changes
// fires only on collection_status UPDATE), so the audit delta is asserted to be
// ZERO. If any audit row appeared, the run FAILS loudly and leaves it for
// manual review instead of deleting blind.
//
// Env (injected at runtime, never committed):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
// Usage:
//   node scripts/postlaunch-smoke.mjs [--url https://jriq.in] [--slug jolly-enterprises] [--amount 10000]
//   (--url adds a page-serves check of <url>/store/<slug> before the spin)
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL_ || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY')
  process.exit(2)
}
if (!URL_.includes('awshkiwqkuubkhecszzk')) {
  console.error(`Refusing to run: ${URL_} is not the production project`)
  process.exit(2)
}

const args = process.argv.slice(2)
function arg(name, dflt) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt
}
const pageBase = arg('url', '')
const slug = arg('slug', 'jolly-enterprises')
const amount = Number(arg('amount', '10000'))
const requestId = randomUUID()
// Synthetic 10-digit Indian mobile (validation: ^[6-9][0-9]{9}$). Random per
// run so it collides with no previous run's rate-limit row.
const phone = `${randomInt(6, 10)}${Array.from({ length: 9 }, () => randomInt(0, 10)).join('')}`
const customerName = 'Postlaunch Smoke'

const service = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL_, ANON_KEY, { auth: { persistSession: false } })

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

const created = { submissionId: null, storeId: null }
const runStart = new Date().toISOString()
let subsBefore = null
let auditBefore = null

async function cleanup() {
  if (created.submissionId) {
    await service.from('submissions').delete().eq('id', created.submissionId)
  }
  if (created.storeId) {
    // Surgical rate-limit removal by primary key: sha256hex(store_id ':' phone)
    // mirrors extensions.digest() in submit_customer_entry.
    const digest = createHash('sha256').update(`${created.storeId}:${phone}`).digest('hex')
    await service.from('public_submission_rate_limits').delete().eq('store_id', created.storeId).eq('phone_digest', digest)
  }
}

async function main() {
  // ---- 0. optional page-serves check (matrix row evidence) ----
  if (pageBase) {
    const res = await fetch(`${pageBase.replace(/\/+$/, '')}/store/${slug}`, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    await res.body?.cancel()
    check('store page served over https (SPA route)', res.status === 200, `status=${res.status}`)
  }

  // ---- 1. pre-run reference counts + protected records ----
  const { count: subsCount } = await service.from('submissions').select('id', { count: 'exact', head: true })
  const { count: auditCount } = await service.from('platform_audit_logs').select('id', { count: 'exact', head: true })
  subsBefore = subsCount
  auditBefore = auditCount
  console.log(`INFO  pre-run counts: submissions=${subsBefore} audit=${auditBefore}`)
  const { data: storeRows } = await service.from('stores').select('id, min_spin_amount').eq('slug', slug)
  check('target store exists and is the known production store', storeRows?.length === 1, JSON.stringify(storeRows ?? null))
  created.storeId = storeRows?.[0]?.id ?? null

  // ---- 2. EXACTLY ONE public spin (the same RPC the customer page calls) ----
  const { data: first, error: firstErr } = await anon.rpc('submit_customer_entry', {
    p_store_slug: slug,
    p_request_id: requestId,
    p_customer_name: customerName,
    p_customer_phone: phone,
    p_purchase_amount: amount,
  })
  if (firstErr) throw new Error(`submit_customer_entry: ${firstErr.message}`)
  const entry = first?.[0]
  check('public spin returns a claim code', typeof entry?.claim_code === 'string' && entry.claim_code.length > 0, String(entry?.claim_code ?? 'none'))
  check('public spin assigned a reward (backend-assigned)', typeof entry?.reward?.name === 'string' && entry.reward.name.length > 0, String(entry?.reward?.name ?? 'none'))
  created.submissionId = entry?.submission_id ?? null

  // ---- 3. claim persisted with snapshot (the matrix row's real assertion) ----
  const { data: row } = await service
    .from('submissions')
    .select('id, coupon_code, reward_label, reward_wheel_label, reward_claim_code_prefix, collection_status, assigned_tier_min_amount, assigned_tier_max_amount, created_at')
    .eq('id', created.submissionId)
    .single()
  check('claim row persisted', row?.id === created.submissionId, JSON.stringify(row ?? null))
  check('claim code matches the returned code', row?.coupon_code === entry?.claim_code, `${String(row?.coupon_code ?? 'none')} vs ${String(entry?.claim_code ?? 'none')}`)
  check('reward snapshot stored immutably on the row', typeof row?.reward_label === 'string' && row.reward_label.length > 0 && typeof row?.reward_claim_code_prefix === 'string', JSON.stringify(row ?? null))
  check('collection_status starts as awaiting', row?.collection_status === 'awaiting', String(row?.collection_status))
  check('submission timestamp inside this run', typeof row?.created_at === 'string' && row.created_at >= runStart, String(row?.created_at))

  // ---- 4. audit delta must be zero (spin inserts are not audited) ----
  const { count: auditAfter } = await service.from('platform_audit_logs').select('id', { count: 'exact', head: true })
  check('no audit rows created by the spin (inserts are not audited)', auditAfter === auditBefore, `after=${auditAfter} before=${auditBefore}`)
}

try {
  await main()
} catch (err) {
  fail += 1
  console.log(`FAIL  post-launch smoke aborted — ${String(err).slice(0, 300)}`)
} finally {
  await cleanup()
}

// ---- 5. post-cleanup proof (runs even after a mid-run failure) ----
if (created.submissionId) {
  const { data: gone } = await service.from('submissions').select('id').eq('id', created.submissionId)
  check('synthetic submission removed', (gone ?? []).length === 0, JSON.stringify(gone ?? null))
}
if (created.storeId) {
  const digest = createHash('sha256').update(`${created.storeId}:${phone}`).digest('hex')
  const { data: rl } = await service.from('public_submission_rate_limits').select('store_id').eq('store_id', created.storeId).eq('phone_digest', digest)
  check('synthetic rate-limit row removed', (rl ?? []).length === 0, JSON.stringify(rl ?? null))
}
const { count: subsAfter } = await service.from('submissions').select('id', { count: 'exact', head: true })
const { count: auditFinal } = await service.from('platform_audit_logs').select('id', { count: 'exact', head: true })
check('submission count back to pre-run reference', subsAfter === subsBefore, `after=${subsAfter} before=${subsBefore}`)
check('audit count unchanged from pre-run reference', auditFinal === auditBefore, `after=${auditFinal} before=${auditBefore}`)
const { data: p1 } = await service.from('submissions').select('id, collection_status').eq('coupon_code', 'GIFT-DDD89040')
const { data: p2 } = await service.from('submissions').select('id, collection_status').eq('coupon_code', 'CLEAN-0CBBDC9A')
check('protected claims intact', p1?.length === 1 && p2?.length === 1, JSON.stringify({ a: p1?.length ?? 0, b: p2?.length ?? 0 }))

console.log(`RESULT ${pass} passed, ${fail} failed (post-launch smoke)`)
process.exit(fail === 0 ? 0 : 1)
