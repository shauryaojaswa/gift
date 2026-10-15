// Production synthetic-residue cleanup (authorised plan section 9, 2026-10-15).
//
// Removes ONE leftover synthetic smoke shop ("Smoke Shop <run>" / slug
// smoke-*, id c8831efe-...) that the pre-fix audit defect stranded on
// production. Runs only after the defect-fix migration is verified (staging
// proof + production smoke) and only through the NORMAL store-deletion path:
// a plain stores delete with all triggers firing. If that delete fails the
// script STOPS and reports — it never disables triggers or bypasses audit.
//
// Read-only locate first (full id, name, slug, synthetic origin), child-count
// recheck (delete nothing if ambiguous or unexpected rows exist), then delete,
// then verify the required audit row survives with store_id NULL and the
// original id preserved in details metadata. The deletion audit row is KEPT.
// No secrets or customer PII printed.
//
// Env (injected at runtime, never committed):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
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

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

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

const RESIDUE_ID_PREFIX = 'c8831efe'
const PROTECTED_SHOP = '00000000-0000-4000-a000-000000000001'

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

async function protectedState() {
  const { data: gift } = await service.from('submissions').select('id, purchase_amount, collection_status').eq('coupon_code', 'GIFT-DDD89040')
  const { data: clean } = await service.from('submissions').select('id, purchase_amount, collection_status').eq('coupon_code', 'CLEAN-0CBBDC9A')
  const { data: shop } = await service.from('stores').select('id, min_spin_amount, active').eq('id', PROTECTED_SHOP)
  const { count: tiers } = await service.from('reward_tiers').select('id', { count: 'exact', head: true }).eq('store_id', PROTECTED_SHOP)
  const { count: rewards } = await service.from('rewards').select('id', { count: 'exact', head: true }).eq('store_id', PROTECTED_SHOP)
  const { count: owners } = await service.from('store_admins').select('id', { count: 'exact', head: true }).eq('store_id', PROTECTED_SHOP).eq('role', 'owner')
  return { gift, clean, shop, tiers, rewards, owners }
}

function protectedOk(s) {
  return s.gift?.length === 1 && s.gift[0].purchase_amount === 50000 && s.gift[0].collection_status === 'awaiting'
    && s.clean?.length === 1 && s.clean[0].purchase_amount === 15000 && s.clean[0].collection_status === 'awaiting'
    && s.shop?.length === 1 && s.shop[0].min_spin_amount === 10000
    && s.tiers === 8 && s.rewards === 8 && s.owners === 1
}

async function main() {
  // ---- 1. READ-ONLY locate the exact synthetic residue ----
  const { data: allStores, error: locErr } = await service
    .from('stores')
    .select('id, name, slug, active, min_spin_amount, created_at')
  if (locErr) throw new Error(`locate query: ${locErr.message}`)
  const candidates = (allStores ?? []).filter((s) =>
    s.id.startsWith(RESIDUE_ID_PREFIX) || (s.name.startsWith('Smoke Shop ') && s.slug.startsWith('smoke-')))
  if (candidates.length !== 1) {
    check('residue identity is unique', false, `candidates=${JSON.stringify(candidates.map((c) => ({ id: c.id, name: c.name, slug: c.slug })))}`)
    throw new Error('residue identity ambiguous - deleting nothing')
  }
  const target = candidates[0]
  check('residue identity is unique', true)
  check('residue id matches the recorded prefix c8831efe', target.id.startsWith(RESIDUE_ID_PREFIX), target.id)
  check('residue origin is synthetic (Smoke Shop name + smoke- slug)', target.name.startsWith('Smoke Shop ') && target.slug.startsWith('smoke-'), `${target.name} / ${target.slug}`)
  console.log(`INFO  verified residue: id=${target.id} name=${target.name} slug=${target.slug} created=${target.created_at}`)

  // ---- 2. child recheck: delete nothing if any business data exists ----
  const before = await childCounts(target.id)
  const beforeClean = { ...before }
  delete beforeClean.stores
  check('residue has zero child rows in every table', Object.values(beforeClean).every((c) => c === 0), JSON.stringify(before))

  // ---- 3. protected baseline ----
  const pre = await protectedState()
  check('protected records intact before deletion', protectedOk(pre), JSON.stringify({ gift: pre.gift?.length, clean: pre.clean?.length, tiers: pre.tiers, rewards: pre.rewards, owners: pre.owners }))

  if (fail > 0) throw new Error('preconditions failed - deleting nothing')

  // ---- 4. NORMAL store deletion (triggers fire; no bypass) ----
  const { error: delErr } = await service.from('stores').delete().eq('id', target.id)
  if (delErr) {
    check('normal store deletion succeeds', false, delErr.message)
    throw new Error('normal deletion failed - stopping without trigger bypass; capture and report')
  }
  check('normal store deletion succeeds', true)

  // ---- 5. verification ----
  const after = await childCounts(target.id)
  const afterClean = { ...after }
  delete afterClean.stores
  check('residue store and all children gone', after.stores === 0 && Object.values(afterClean).every((c) => c === 0), JSON.stringify(after))
  const { data: delAudit } = await service
    .from('platform_audit_logs')
    .select('id, store_id, action, details, created_at')
    .eq('action', 'stores.delete')
    .filter('details->>deleted_store_id', 'eq', target.id)
  check('required audit row exists (deletion event)', (delAudit ?? []).length === 1, JSON.stringify(delAudit ?? null))
  check('audit row store fk is null as designed', delAudit?.[0]?.store_id === null, String(delAudit?.[0]?.store_id))
  check('original store id preserved in audit metadata', delAudit?.[0]?.details?.deleted_store_id === target.id, String(delAudit?.[0]?.details?.deleted_store_id ?? 'none'))
  const { count: totalStores } = await service.from('stores').select('id', { count: 'exact', head: true })
  check('no other store rows affected', (totalStores ?? -1) === (allStores ?? []).length - 1, `before=${(allStores ?? []).length} after=${totalStores}`)
  const post = await protectedState()
  check('protected claim GIFT-DDD89040 intact after deletion', post.gift?.length === 1 && post.gift[0].purchase_amount === 50000 && post.gift[0].collection_status === 'awaiting', JSON.stringify(post.gift ?? null))
  check('protected claim CLEAN-0CBBDC9A intact after deletion', post.clean?.length === 1 && post.clean[0].purchase_amount === 15000 && post.clean[0].collection_status === 'awaiting', JSON.stringify(post.clean ?? null))
  check('protected owner + shop configuration intact', protectedOk(post), JSON.stringify({ gift: post.gift?.length, clean: post.clean?.length, tiers: post.tiers, rewards: post.rewards, owners: post.owners }))
  console.log(`INFO  deletion audit row KEPT: id=${delAudit?.[0]?.id} action=${delAudit?.[0]?.action}`)
}

try {
  await main()
} catch (err) {
  fail += 1
  console.log(`FAIL  residue cleanup aborted — ${String(err).slice(0, 300)}`)
}
console.log(`RESULT ${pass} passed, ${fail} failed (production residue cleanup)`)
process.exit(fail === 0 ? 0 : 1)
