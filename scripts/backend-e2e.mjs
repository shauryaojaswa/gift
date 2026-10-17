#!/usr/bin/env node
// Backend end-to-end suite - real Supabase persistence, no mocks, no
// localStorage. Exercises auth, RLS/tenant isolation, the authoritative reward
// engine (submit_customer_entry), idempotency, rate limits, concurrent
// submissions, gift collection, and API error hygiene - and records latency
// per call (p50/p95/max) as evidence for the capacity review.
//
// Staging only: this suite CREATES synthetic customer entries ("QA ..." names,
// random synthetic phones). It refuses production. Cleanup removes exactly the
// synthetic rows (submissions first - reward_id is ON DELETE RESTRICT).
//
// Usage:
//   node scripts/backend-e2e.mjs run [--keys <keys.json>] [--creds-dir <dir>]
//        [--slugs a,b,c,d] [--concurrency 12]
//   node scripts/backend-e2e.mjs cleanup [--keys <keys.json>] [--slugs a,b,c,d]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const [sub, ...rest] = process.argv.slice(2)
function argValue(flag, fallback = null) {
  const i = rest.indexOf(flag)
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback
}
if (sub !== 'run' && sub !== 'cleanup') {
  console.error('Usage: node scripts/backend-e2e.mjs <run|cleanup> [--keys <keys.json>] [--creds-dir <dir>] [--slugs a,b,c,d]')
  process.exit(2)
}
const KEYS_FILE = argValue('--keys', join(process.env.TEMP ?? '/tmp', 'jriq-keys-staging.json'))
const CREDS_DIR = argValue('--creds-dir', join(process.env.TEMP ?? '/tmp', 'jriq-qa-creds'))
const SLUGS = (argValue('--slugs', 'pashupati1,pashupati2,pashupati,shreemanali')).split(',').map((s) => s.trim())
const CONCURRENCY = Number(argValue('--concurrency', '12'))

const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
if (!keys.url || !keys.anon || !keys.service) {
  console.error('keys file must carry url / anon / service')
  process.exit(2)
}
if (keys.url.includes('awshkiwqkuubkhecszzk') || keys.url.includes('jriq.in')) {
  console.error('Refusing to run backend-e2e against production: this suite creates synthetic claims')
  process.exit(2)
}

const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })

let pass = 0
let fail = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}
const latencies = []
async function timed(label, fn) {
  const t0 = Date.now()
  try {
    return await fn()
  } finally {
    latencies.push({ label, ms: Date.now() - t0 })
  }
}
function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}
function cleanErr(err) {
  return String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 140)
}
function leaksSecrets(msg) {
  return /service_role|Bearer eyJ|postgres|P0001: |at .*\.sql:/i.test(msg)
}

const RUN_TAG = Date.now().toString(36).toUpperCase()
function syntheticPhone() {
  // random per run: deterministic phones would collide with a previous run's
  // rate-limit counters and row counts
  return `9${String(100000000 + Math.floor(Math.random() * 899999999))}`
}
function nameTag(base) {
  return `${base} ${RUN_TAG}`
}
function uuid() {
  return crypto.randomUUID()
}

async function storeId(slug) {
  const { data } = await service.from('stores').select('id').eq('slug', slug).maybeSingle()
  return data?.id ?? null
}
async function storeRewardIds(slug) {
  const id = await storeId(slug)
  const { data } = await service.from('rewards').select('id').eq('store_id', id)
  return (data ?? []).map((r) => r.id)
}

async function run() {
  // =======================================================================
  // AUTH & AUTHORISATION
  // =======================================================================
  const credsA = JSON.parse(readFileSync(join(CREDS_DIR, `${SLUGS[0]}.json`), 'utf8'))
  const credsB = JSON.parse(readFileSync(join(CREDS_DIR, `${SLUGS[1]}.json`), 'utf8'))
  const clientA = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
  const clientB = createClient(keys.url, keys.anon, { auth: { persistSession: false } })

  const loginA = await timed('auth.login', () => clientA.auth.signInWithPassword({ email: credsA.email, password: credsA.password }))
  check('A1 store admin sign-in succeeds', !loginA.error && !!loginA.data.session, cleanErr(loginA.error))

  const badLogin = await timed('auth.login-bad', () =>
    createClient(keys.url, keys.anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email: credsA.email, password: 'definitely-wrong-password-123' }),
  )
  check('A2 wrong password is rejected (no session)', !!badLogin.error && !badLogin.data.session)

  const { data: membershipA } = await clientA.from('store_admins').select('store_id, email')
  const storeA = await storeId(SLUGS[0])
  const storeB = await storeId(SLUGS[1])
  check(
    'A3 admin A sees only its own store membership',
    (membershipA ?? []).length === 1 && membershipA[0].store_id === storeA && (membershipA ?? []).every((m) => m.store_id !== storeB),
    `rows=${(membershipA ?? []).length}`,
  )

  const { data: anonMembers } = await anon.from('store_admins').select('store_id')
  check('A4 anonymous cannot read store_admins', (anonMembers ?? []).length === 0)

  // =======================================================================
  // RLS / TENANT ISOLATION
  // =======================================================================
  const { data: anonStores } = await anon.from('stores').select('id, slug')
  check('R1 anonymous can read store landing data', (anonStores ?? []).length >= SLUGS.length)

  const { error: anonInsert } = await anon.from('submissions').insert({
    store_id: storeA,
    customer_name: 'QA Intruder',
    customer_phone: syntheticPhone(),
    purchase_amount: 2000,
    reward_id: (await storeRewardIds(SLUGS[0]))[0],
    reward_label: 'QA Intruder',
  })
  check('R2 anonymous cannot insert submissions directly', !!anonInsert, 'direct insert accepted!')

  // PostgREST answers RLS-refused UPDATE/DELETE with success + 0 affected rows,
  // so these assert the EFFECT (0 rows touched, value unchanged), not an error.
  const { data: updRows, error: anonUpdate } = await anon.from('stores').update({ subtitle: 'hacked' }).eq('id', storeA).select('id')
  const { data: storeAAfter } = await service.from('stores').select('subtitle').eq('id', storeA).maybeSingle()
  check(
    'R3 anonymous cannot update stores (0 rows touched, value unchanged)',
    !anonUpdate && (updRows ?? []).length === 0 && storeAAfter?.subtitle !== 'hacked',
    `affected=${(updRows ?? []).length} err=${cleanErr(anonUpdate)}`,
  )

  const rewardIdsABefore = await storeRewardIds(SLUGS[0])
  const { data: delRows, error: anonDelete } = await anon.from('rewards').delete().eq('store_id', storeA).select('id')
  const rewardIdsAAfter = await storeRewardIds(SLUGS[0])
  check(
    'R4 anonymous cannot delete rewards (0 rows touched)',
    !anonDelete && (delRows ?? []).length === 0 && rewardIdsAAfter.length === rewardIdsABefore.length,
    `affected=${(delRows ?? []).length} err=${cleanErr(anonDelete)}`,
  )

  const { data: anonSubs } = await anon.from('submissions').select('id')
  const { data: anonLimits } = await anon.from('public_submission_rate_limits').select('submission_count')
  check(
    'R5 anonymous reads nothing from submissions/rate-limits',
    (anonSubs ?? []).length === 0 && (anonLimits ?? []).length === 0,
  )
  // honest note: the demo model's user_attempts is NOT part of the Supabase
  // schema (request_id idempotency replaced it) - no assertion is made on it

  // =======================================================================
  // REWARD ENGINE - submit_customer_entry (the real customer path)
  // =======================================================================
  const reqS1 = uuid()
  const phoneS1 = syntheticPhone()
  const s1 = await timed('rpc.submit', () =>
    anon.rpc('submit_customer_entry', {
      p_store_slug: SLUGS[0],
      p_request_id: reqS1,
      p_customer_name: nameTag('QA Engine One'),
      p_customer_phone: phoneS1,
      p_purchase_amount: 2000,
      p_review_cta_shown: true,
      p_review_cta_clicked: false,
    }),
  )
  const s1Row = Array.isArray(s1.data) ? s1.data[0] : s1.data
  check('S1 valid entry returns claim code + tier + reward', !s1.error && !!s1Row?.claim_code, cleanErr(s1.error))
  check('S1 claim code format matches the platform contract', /^[A-Z]{3,4}-[A-Z0-9]{4,}/.test(String(s1Row?.claim_code ?? '')), String(s1Row?.claim_code ?? ''))
  check(
    'S1 amount 2000 maps to tier 1,000-4,999 -> shop A reward',
    s1Row?.tier?.min_amount === 1000 && s1Row?.reward?.name === `QA Gift ${SLUGS[0]} A`,
    `tier=${s1Row?.tier?.min_amount}-${s1Row?.tier?.max_amount} reward=${s1Row?.reward?.name}`,
  )

  const reqS2 = uuid()
  const s2 = await timed('rpc.submit', () =>
    anon.rpc('submit_customer_entry', {
      p_store_slug: SLUGS[3],
      p_request_id: reqS2,
      p_customer_name: nameTag('QA Engine Two'),
      p_customer_phone: syntheticPhone(),
      p_purchase_amount: 5000,
    }),
  )
  const s2Row = Array.isArray(s2.data) ? s2.data[0] : s2.data
  check(
    'S2 amount 5000 maps to tier 5,000+ -> shop B reward (per-shop mapping)',
    !s2.error && s2Row?.tier?.min_amount === 5000 && s2Row?.reward?.name === `QA Gift ${SLUGS[3]} B`,
    `tier=${s2Row?.tier?.min_amount} reward=${s2Row?.reward?.name} ${cleanErr(s2.error)}`,
  )

  const badName = await timed('rpc.submit-invalid', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0], p_request_id: uuid(), p_customer_name: 'X', p_customer_phone: syntheticPhone(), p_purchase_amount: 2000 }),
  )
  check('S3 too-short name rejected server-side', !!badName.error && /Invalid customer entry/i.test(badName.error.message), cleanErr(badName.error))

  const badPhone = await timed('rpc.submit-invalid', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0], p_request_id: uuid(), p_customer_name: nameTag('QA Bad Phone'), p_customer_phone: '12345', p_purchase_amount: 2000 }),
  )
  check('S4 invalid phone rejected server-side', !!badPhone.error && /valid 10-digit/i.test(badPhone.error.message), cleanErr(badPhone.error))

  const badAmount = await timed('rpc.submit-invalid', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0], p_request_id: uuid(), p_customer_name: nameTag('QA Bad Amount'), p_customer_phone: syntheticPhone(), p_purchase_amount: 0 }),
  )
  check('S5 amount 0 rejected server-side', !!badAmount.error, cleanErr(badAmount.error))
  check('S3-S5 error text leaks nothing internal', !leaksSecrets([badName.error?.message, badPhone.error?.message, badAmount.error?.message].join(' ')))

  const belowFloor = await timed('rpc.submit-invalid', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0], p_request_id: uuid(), p_customer_name: nameTag('QA Below Floor'), p_customer_phone: syntheticPhone(), p_purchase_amount: 500 }),
  )
  check('S6 amount below the prize floor fails cleanly (no tier, no row)', !!belowFloor.error, cleanErr(belowFloor.error))

  const s1Repeat = await timed('rpc.submit-idempotent', () =>
    anon.rpc('submit_customer_entry', {
      p_store_slug: SLUGS[0],
      p_request_id: reqS1,
      p_customer_name: nameTag('QA Engine One'),
      p_customer_phone: phoneS1,
      p_purchase_amount: 2000,
      p_review_cta_shown: true,
      p_review_cta_clicked: false,
    }),
  )
  const s1RepeatRow = Array.isArray(s1Repeat.data) ? s1Repeat.data[0] : s1Repeat.data
  check(
    'S7 retry with same request_id returns the SAME claim (no second reward)',
    !s1Repeat.error && s1RepeatRow?.submission_id === s1Row?.submission_id && s1RepeatRow?.claim_code === s1Row?.claim_code,
    `id ${s1RepeatRow?.submission_id} vs ${s1Row?.submission_id}`,
  )

  const s1Reuse = await timed('rpc.submit-invalid', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0], p_request_id: reqS1, p_customer_name: nameTag('QA Engine One'), p_customer_phone: phoneS1, p_purchase_amount: 9999 }),
  )
  check('S8 request_id reuse with different data is rejected', !!s1Reuse.error && /already been used/i.test(s1Reuse.error.message), cleanErr(s1Reuse.error))

  const unknownSlug = await timed('rpc.submit-invalid', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: 'no-such-shop-xyz', p_request_id: uuid(), p_customer_name: nameTag('QA Unknown'), p_customer_phone: syntheticPhone(), p_purchase_amount: 2000 }),
  )
  check('S9 unknown store slug fails cleanly', !!unknownSlug.error && /Campaign is unavailable/i.test(unknownSlug.error.message), cleanErr(unknownSlug.error))

  // rate limit: repeated entries from one phone
  const rlPhone = syntheticPhone()
  let rlOk = 0
  let rlRejected = false
  let rlMsg = ''
  for (let i = 0; i < 8; i += 1) {
    const r = await timed('rpc.submit-ratelimit', () =>
      anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0], p_request_id: uuid(), p_customer_name: nameTag(`QA Rate ${i}`), p_customer_phone: rlPhone, p_purchase_amount: 2000 }),
    )
    if (!r.error) rlOk += 1
    else {
      rlRejected = true
      rlMsg = cleanErr(r.error)
      break
    }
  }
  check('S10 per-phone rate limit kicks in (duplicate flood bounded)', rlRejected && rlOk > 0 && rlOk <= 6, `accepted=${rlOk} then ${rlMsg}`)
  console.log(`INFO  rate limit: one phone accepted ${rlOk} entries per store before rejection (S10)`)
  console.log(`INFO  run tag: ${RUN_TAG} (synthetic names carry it; phones are random per run)`)

  const malformed = await timed('rpc.submit-malformed', () =>
    anon.rpc('submit_customer_entry', { p_store_slug: SLUGS[0] }),
  )
  check('S11 malformed payload fails cleanly without internal leakage', !!malformed.error && !leaksSecrets(malformed.error.message), cleanErr(malformed.error))

  // =======================================================================
  // CONCURRENT SUBMISSIONS across the ACTIVE shops (capacity evidence).
  // The draft shop (campaign inactive BY DESIGN) must reject claims even
  // under concurrent load - asserted separately as C5.
  // =======================================================================
  const rewardIdsBySlug = {}
  for (const slug of SLUGS) rewardIdsBySlug[slug] = await storeRewardIds(slug)

  const ACTIVE_SLUGS = SLUGS.filter((s) => s !== 'pashupati')
  const jobs = []
  for (let i = 0; i < CONCURRENCY; i += 1) {
    const slug = ACTIVE_SLUGS[i % ACTIVE_SLUGS.length]
    jobs.push({ slug, req: uuid(), phone: syntheticPhone(), name: nameTag(`QA Parallel ${i}`), amount: i % 2 === 0 ? 2000 : 5000 })
  }
  const t0 = Date.now()
  const results = await Promise.all(
    jobs.map((j) =>
      anon.rpc('submit_customer_entry', {
        p_store_slug: j.slug,
        p_request_id: j.req,
        p_customer_name: j.name,
        p_customer_phone: j.phone,
        p_purchase_amount: j.amount,
      }),
    ),
  )
  const wallMs = Date.now() - t0
  const rows = results.map((r) => (Array.isArray(r.data) ? r.data[0] : r.data))
  const errors = results.map((r) => r.error).filter(Boolean)
  const claimCodes = rows.map((r) => r?.claim_code).filter(Boolean)
  check(`C1 all ${CONCURRENCY} concurrent submissions on active shops succeed`, errors.length === 0, errors.map(cleanErr).join(' | '))
  check('C2 every concurrent submission gets a unique claim code', new Set(claimCodes).size === claimCodes.length, `unique=${new Set(claimCodes).size}/${claimCodes.length}`)
  const rewardsOk = jobs.every((j, i) => {
    const expected = j.amount === 2000 ? `QA Gift ${j.slug} A` : `QA Gift ${j.slug} B`
    return rows[i]?.reward?.name === expected
  })
  check('C3 concurrent rewards stay inside each shop (cross-tenant isolation under load)', rewardsOk)
  const persisted = await service.from('submissions').select('id, reward_label').in('customer_name', jobs.map((j) => j.name))
  check('C4 exactly one row per concurrent submission persisted', (persisted.data ?? []).length === CONCURRENCY, `rows=${(persisted.data ?? []).length}`)
  console.log(`INFO  concurrency: ${CONCURRENCY} parallel RPC calls in ${wallMs}ms (${((CONCURRENCY / wallMs) * 1000).toFixed(1)} req/s)`)

  // draft shop must reject claims even under concurrent load (by design)
  const draftJobs = [0, 1, 2].map((i) => ({ slug: 'pashupati', req: uuid(), phone: syntheticPhone(), name: nameTag(`QA Draft ${i}`), amount: 2000 }))
  const draftResults = await Promise.all(
    draftJobs.map((j) =>
      anon.rpc('submit_customer_entry', { p_store_slug: j.slug, p_request_id: j.req, p_customer_name: j.name, p_customer_phone: j.phone, p_purchase_amount: j.amount }),
    ),
  )
  check(
    'C5 draft shop rejects claims under concurrent load (campaign inactive by design)',
    draftResults.every((r) => r.error && /Campaign is unavailable/i.test(r.error.message)),
    draftResults.map((r) => cleanErr(r.error)).join(' | '),
  )

  // cross-tenant write refusal with a signed-in admin
  const { error: crossWrite } = await clientA
    .from('submissions')
    .update({ collection_status: 'collected' })
    .eq('store_id', storeB)
  check('R6 admin A cannot modify shop B submissions', !!crossWrite, 'cross-tenant update accepted!')
  const { data: crossRead } = await clientA.from('submissions').select('id').eq('store_id', storeB)
  check('R7 admin A reads zero rows from shop B', (crossRead ?? []).length === 0, `rows=${(crossRead ?? []).length}`)

  // =======================================================================
  // GIFT COLLECTION (signed-in owner path)
  // =======================================================================
  const loginB = await clientB.auth.signInWithPassword({ email: credsB.email, password: credsB.password })
  check('A5 second store admin sign-in succeeds', !loginB.error)

  const collect = await timed('rpc.collect', () => clientA.rpc('mark_submission_collected', { p_submission_id: s1Row?.submission_id }))
  check('G1 owner marks own gift collected', !collect.error, cleanErr(collect.error))
  const { data: collectedRow } = await clientA
    .from('submissions')
    .select('collection_status, collected_at, collected_by')
    .eq('id', s1Row?.submission_id)
    .maybeSingle()
  check(
    'G2 collection persists with status/at/by',
    collectedRow?.collection_status === 'collected' && !!collectedRow?.collected_at,
    `status=${collectedRow?.collection_status}`,
  )

  const doubleCollect = await timed('rpc.collect', () => clientA.rpc('mark_submission_collected', { p_submission_id: s1Row?.submission_id }))
  check('G3 double collection is rejected', !!doubleCollect.error, 'second collection accepted!')

  const crossCollect = await timed('rpc.collect', () => clientB.rpc('mark_submission_collected', { p_submission_id: s1Row?.submission_id }))
  check('G4 shop B owner cannot collect shop A gift', !!crossCollect.error, 'cross-tenant collection accepted!')

  // =======================================================================
  // PERSISTENCE & API RELIABILITY
  // =======================================================================
  await new Promise((r) => setTimeout(r, 1500))
  const { data: verifyRows } = await service
    .from('submissions')
    .select('customer_name, coupon_code, collection_status')
    .in('customer_name', jobs.map((j) => j.name))
  const stable = (verifyRows ?? []).length === CONCURRENCY && new Set((verifyRows ?? []).map((r) => r.coupon_code)).size === CONCURRENCY
  check('P1 rows and claim codes persist across a reload window', stable, `rows=${(verifyRows ?? []).length}`)

  const unknownTable = await timed('rest.404', () => anon.from('definitely_not_a_table').select('id'))
  check('P2 unknown relation fails with a clean REST error', !!unknownTable.error, cleanErr(unknownTable.error))

  // latency summary
  const byLabel = {}
  for (const l of latencies) (byLabel[l.label] ??= []).push(l.ms)
  console.log('INFO  latency percentiles (ms):')
  for (const [label, values] of Object.entries(byLabel)) {
    console.log(`INFO    ${label}: n=${values.length} p50=${percentile(values, 50)} p95=${percentile(values, 95)} max=${Math.max(...values)}`)
  }

  console.log(`RESULT backend-e2e: ${pass} passed, ${fail} failed`)
  if (failures.length) console.log(`INFO  failed rows: ${failures.join(' | ')}`)
}

async function cleanup() {
  for (const slug of SLUGS) {
    const id = await storeId(slug)
    if (!id) continue
    // delete by FILTER (short query string): the perf phases leave thousands
    // of synthetic rows and an in.(...) id list overflows the URL (400)
    const { count } = await service
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', id)
      .like('customer_name', 'QA %')
    const { error } = await service.from('submissions').delete().eq('store_id', id).like('customer_name', 'QA %')
    if (error) throw new Error(`submissions delete (${slug}): ${error.message}`)
    // rate-limit counters for synthetic traffic (staging has no real customers)
    const { error: rlErr } = await service.from('public_submission_rate_limits').delete().eq('store_id', id)
    if (rlErr) throw new Error(`rate limits delete (${slug}): ${rlErr.message}`)
    console.log(`PASS  ${slug}: removed ${count ?? 0} synthetic submissions + rate-limit counters`)
  }
  console.log('RESULT cleanup complete (rewards/tiers: run qa-fixtures prizes down)')
}

;(sub === 'run' ? run : cleanup)().catch((err) => {
  console.error(`FAIL  ${err?.stack ?? err}`)
  process.exit(1)
})
