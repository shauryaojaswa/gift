// Shree Jewellers (shreejwellers) acceptance on STAGING - backend contract.
//
// Exercises the REAL persist-first path against the staged shop through the
// same RPCs the app uses:
//   - shop configuration + public gift pools (customer page contract)
//   - boundary purchase amounts through submit_customer_entry (persist-first,
//     backend-authoritative award): each amount maps to exactly one bracket
//   - prize-bundle snapshots name the complete prize incl. the coupon
//   - idempotent claims by request_id; conflicting reuse is rejected
//   - atomic collection; double-collect is rejected
//   - tenant-scoped owner reads
//
// Synthetic data only (staging project wpytaorgiqkfnifsuhax); created rows are
// removed at the end. Never point this at production.
//
// Usage (PowerShell):
//   $env:SUPABASE_STAGING_URL = 'https://wpytaorgiqkfnifsuhax.supabase.co'
//   $env:SUPABASE_STAGING_ANON_KEY = <anon key>
//   $env:SUPABASE_STAGING_SERVICE_KEY = <service key>
//   $env:SHREE_OWNER_PASSWORD = <staging owner password>
//   node scripts/shree-acceptance.mjs
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const API_URL = process.env.SUPABASE_STAGING_URL
const ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_STAGING_SERVICE_KEY
const OWNER_EMAIL = process.env.SHREE_OWNER_EMAIL ?? 'shree-owner-staging@jriq-smoke.test'
const OWNER_PASSWORD = process.env.SHREE_OWNER_PASSWORD

if (!API_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_STAGING_URL / _ANON_KEY / _SERVICE_KEY')
  process.exit(2)
}
if (!API_URL.includes('wpytaorgiqkfnifsuhax')) {
  console.error(`Refusing to run: ${API_URL} is not the verified staging project`)
  process.exit(2)
}
if (!OWNER_PASSWORD) {
  console.error('Missing SHREE_OWNER_PASSWORD (staging owner password)')
  process.exit(2)
}

const SLUG = 'shreejwellers'
const REVIEW_URL =
  'https://www.google.com/search?hl=en-IN&gl=in&q=PF32%2BCJV+Shree+Jewellers,+Jawaharnagar,+Maharashtra+416115&ludocid=1061963283657064940&lsig=AB86z5WxzN8H7u5nQ49b24LliIAr#lrd=0x3bc11d000be053c1:0xebcd9fadee301ec,3'

const BAG = 'Bag + ₹1,200 Saree Coupon'
const SPK_S = 'Small Bluetooth Speaker + ₹1,200 Saree Coupon'
const SAREE = 'Saree + ₹1,200 Saree Coupon'
const HEAD_C = 'Bluetooth Headband + ₹1,200 Saree Coupon'
const SPK_L = 'Big Bluetooth Speaker'
const HEAD = 'Bluetooth Headband'
const DINNER = 'Dinner Set'
const MIXER = 'Mixer Grinder'

// Boundary matrix: amount -> expected bracket [min, max) and allowed prizes.
const CASES = [
  { amount: 4999, tier: null, rewards: null },
  { amount: 5000, tier: [5000, 15000], rewards: [BAG] },
  { amount: 14999, tier: [5000, 15000], rewards: [BAG] },
  { amount: 15000, tier: [15000, 50000], rewards: [SPK_S, SAREE, HEAD_C] },
  { amount: 49999, tier: [15000, 50000], rewards: [SPK_S, SAREE, HEAD_C] },
  { amount: 50000, tier: [50000, 100000], rewards: [SPK_L, HEAD] },
  { amount: 99999, tier: [50000, 100000], rewards: [SPK_L, HEAD] },
  { amount: 100000, tier: [100000, 200000], rewards: [DINNER] },
  { amount: 199999, tier: [100000, 200000], rewards: [DINNER] },
  { amount: 200000, tier: [200000, null], rewards: [MIXER] },
  { amount: 250000, tier: [200000, null], rewards: [MIXER] },
]

const service = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })

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

const createdSubmissions = []
let phoneSeq = 0
function nextPhone() {
  phoneSeq += 1
  return `9${String(876500000 + phoneSeq).slice(-9)}`
}

async function submit(amount, { requestId = randomUUID(), name, phone } = {}) {
  const { data, error } = await anon.rpc('submit_customer_entry', {
    p_store_slug: SLUG,
    p_request_id: requestId,
    p_customer_name: name ?? `Shree QA ${amount}`,
    p_customer_phone: phone ?? nextPhone(),
    p_purchase_amount: amount,
    p_review_cta_shown: true,
    p_review_cta_clicked: false,
  })
  return { data, error, requestId }
}

async function main() {
  // ---- 1. shop configuration (customer page contract) ----
  const { data: shopRows } = await service
    .from('stores')
    .select('id, slug, name, min_spin_amount, google_review_url, status')
    .eq('slug', SLUG)
  const shop = shopRows?.[0]
  check('shop exists exactly once', (shopRows ?? []).length === 1)
  check('display name is Shree Jewellers', shop?.name === 'Shree Jewellers', String(shop?.name))
  check('shop is active', shop?.status === 'active', String(shop?.status))
  check('minimum qualifying purchase is ₹5,000', shop?.min_spin_amount === 5000, String(shop?.min_spin_amount))
  check('Google review link stored verbatim on the shop', shop?.google_review_url === REVIEW_URL)

  // ---- 2. public gift pools ----
  const { data: pool, error: poolErr } = await anon.rpc('get_store_gift_pool', { p_store_slug: SLUG })
  check('public gift-pool read works without authentication', !poolErr, poolErr?.message ?? '')
  const poolNames = (pool ?? []).map((r) => r.gift_name).sort()
  const expectedPool = [BAG, SPK_S, SAREE, HEAD_C, SPK_L, HEAD, DINNER, MIXER].sort()
  check(
    'pools hold the 8 commissioned prizes (bundles incl. the coupon)',
    JSON.stringify(poolNames) === JSON.stringify(expectedPool),
    JSON.stringify(poolNames),
  )
  for (const name of poolNames) {
    if (name.includes('+')) {
      check(`bundle never conceals the coupon: ${name}`, name.includes('₹1,200 Saree Coupon'))
    }
  }

  // ---- 3. boundary amounts through the persist-first award path ----
  for (const c of CASES) {
    const { data, error } = await submit(c.amount)
    if (c.tier === null) {
      check(
        `₹${c.amount.toLocaleString('en-IN')} is below the ₹5,000 minimum - no reward`,
        !!error && /No unique active reward/.test(error.message),
        error?.message ?? JSON.stringify(data),
      )
      continue
    }
    if (error) {
      check(`₹${c.amount} awarded`, false, error.message)
      continue
    }
    const row = Array.isArray(data) ? data[0] : data
    createdSubmissions.push(row.submission_id)
    const [tMin, tMax] = c.tier
    check(
      `₹${c.amount.toLocaleString('en-IN')} -> exactly bracket [${tMin}, ${tMax === null ? '∞' : tMax})`,
      row.tier?.min_amount === tMin && row.tier?.max_amount === tMax,
      JSON.stringify(row.tier),
    )
    check(
      `₹${c.amount.toLocaleString('en-IN')} award is one of the bracket pool`,
      c.rewards.includes(row.reward?.name),
      JSON.stringify(row.reward?.name),
    )
    if (c.rewards.some((r) => r.includes('+'))) {
      check(
        `₹${c.amount.toLocaleString('en-IN')} snapshot names the complete bundle incl. coupon`,
        row.reward?.name.includes('₹1,200 Saree Coupon') && row.reward?.name.includes('+'),
        JSON.stringify(row.reward?.name),
      )
      check(
        `₹${c.amount.toLocaleString('en-IN')} snapshot carries the coupon marker on the wheel line`,
        (row.reward?.description ?? '').includes('Coupon'),
        JSON.stringify(row.reward?.description),
      )
    }
    check(
      `₹${c.amount.toLocaleString('en-IN')} claim code uses the reward prefix`,
      typeof row.claim_code === 'string' && row.claim_code.startsWith(`${row.reward?.claim_code_prefix}-`),
      String(row.claim_code),
    )
  }

  // ---- 4. idempotent claims by request_id ----
  const requestId = randomUUID()
  const idemPhone = nextPhone()
  const first = await submit(5000, { requestId, name: 'Shree QA Idem', phone: idemPhone })
  check('first claim persisted', !first.error, first.error?.message ?? '')
  createdSubmissions.push(first.data?.[0]?.submission_id)
  // Same request_id + same details must return the SAME claim.
  const again = await submit(5000, { requestId, name: 'Shree QA Idem', phone: idemPhone })
  check(
    're-submitting the same request_id returns the identical claim',
    !again.error &&
      again.data?.[0]?.submission_id === first.data?.[0]?.submission_id &&
      again.data?.[0]?.claim_code === first.data?.[0]?.claim_code,
    again.error?.message ?? JSON.stringify(again.data?.[0] ?? null),
  )
  const conflict = await anon.rpc('submit_customer_entry', {
    p_store_slug: SLUG,
    p_request_id: requestId,
    p_customer_name: 'Shree QA Idem',
    p_customer_phone: nextPhone(),
    p_purchase_amount: 7000,
    p_review_cta_shown: true,
    p_review_cta_clicked: false,
  })
  check(
    'reusing a request_id with different details is rejected',
    !!conflict.error && /already been used/.test(conflict.error.message),
    conflict.error?.message ?? JSON.stringify(conflict.data),
  )

  // ---- 5. atomic collection + double-collect rejection ----
  const owner = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: signInErr } = await owner.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  })
  check('shop owner sign-in works', !signInErr, signInErr?.message ?? '')
  const target = createdSubmissions[0]
  const { data: collect1, error: collect1Err } = await owner.rpc('mark_submission_collected', {
    p_submission_id: target,
  })
  check('Mark Collected succeeds as the shop owner', !collect1Err, collect1Err?.message ?? JSON.stringify(collect1))
  const { error: collect2Err } = await owner.rpc('mark_submission_collected', { p_submission_id: target })
  check(
    'double collection is rejected atomically',
    !!collect2Err && /already been collected/.test(collect2Err.message),
    collect2Err?.message ?? 'second call succeeded',
  )
  const { data: collectedRow } = await service
    .from('submissions')
    .select('collection_status, reward_label')
    .eq('id', target)
    .limit(1)
  check(
    'collection status recorded on the submission',
    collectedRow?.[0]?.collection_status === 'collected',
    JSON.stringify(collectedRow?.[0] ?? null),
  )
  check(
    'vendor record keeps the complete bundle name',
    typeof collectedRow?.[0]?.reward_label === 'string',
    String(collectedRow?.[0]?.reward_label),
  )

  // ---- 6. tenant-scoped owner reads ----
  const { data: ownerView } = await owner.from('submissions').select('id, store_id')
  check(
    'owner reads only their own shop records',
    (ownerView ?? []).every((r) => r.store_id === shop.id),
    `rows=${(ownerView ?? []).length}`,
  )

  // ---- 7. cleanup (synthetic staging rows) ----
  if (createdSubmissions.length) {
    const { error: delErr } = await service.from('submissions').delete().in('id', createdSubmissions)
    check('synthetic submissions removed', !delErr, delErr?.message ?? '')
  }
  await service
    .from('public_submission_rate_limits')
    .delete()
    .eq('store_id', shop.id)

  console.log(`RESULT ${pass} passed, ${fail} failed (shreejwellers staging acceptance)`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL  acceptance aborted - ${err?.message ?? err}`)
  process.exit(1)
})
