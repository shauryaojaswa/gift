#!/usr/bin/env node
// Apply the approved Shree Manali Ethnic Galore reward ladder + Google review
// link to a shop on a known project. Idempotent: the shop's reward catalog is
// replaced as a whole (before-state is printed, nothing is deleted silently),
// and stores.google_review_url is set through the same column the owner
// settings screen writes.
//
// Usage:
//   node scripts/set-shop-catalog.mjs --env staging [--keys <keys.json>]
//   node scripts/set-shop-catalog.mjs --env production --confirm-production [--keys <keys.json>]
//   node scripts/set-shop-catalog.mjs --env staging --dry-run
//
// The reward ladder below is the customer-supplied range table with three
// documented revisions (never silent):
//   1. the band starts at Re 1 (the platform rejects min_amount <= 0 and a
//      purchase amount of 0); every purchase below Rs 1,000 is still covered
//   2. the customer's table had NO reward between Rs 25,000 and Rs 10,00,000;
//      "10% flat discount on current bill" is widened to Rs 25,000 - Rs 20,00,000
//      to close that gap ("now revise it"), keeping every reward name as sent
//   3. the top band ends open-ended ("Rs 25,00,000 and above") because the
//      platform requires the last tier to be unbounded
//   4. the shop's spin floor (min_spin_amount) is lowered to Re 1 - it was
//      Rs 1,000, which would have prevented the "0-1,000 Free Delivery" band
//      from spinning at all
// Ranges are half-open [min, max) exactly like the reward engine reads them.
// Reward names are the customer's wording.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const argValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const has = (flag) => process.argv.includes(flag)

const ENV = argValue('--env', 'staging')
const SLUG = argValue('--slug', 'shreemanali')
const DRY_RUN = has('--dry-run')
const KEYS_FILE = argValue('--keys', join(tmpdir(), ENV === 'production' ? 'jriq-keys-prod.json' : 'jriq-keys-staging.json'))
if (!REF_BY_ENV[ENV]) {
  console.error(`Unknown --env ${ENV}`)
  process.exit(2)
}
if (ENV === 'production' && !has('--confirm-production')) {
  console.error('Refusing to write production config without --confirm-production')
  process.exit(2)
}

const GOOGLE_REVIEW_URL =
  'https://www.google.com/search?kgmid=/g/11btwrcb9h&hl=en-IN&q=Shree+Manali+Ethnic+Galore&shem=epsd1,ltae,rimspwouoe&shndl=30&kgs=5dfe5f204d669f99&utm_source=epsd1,ltae,rimspwouoe,sh/x/loc/osrp/m1/4#lrd=0x3bc2eaa1acc72927:0x3f5167e78b4150a7,3,,,,'

// [min, max) in whole rupees; max null = open-ended.
// `name` is the customer-supplied reward name (reveal + receipt); `wheel` is
// the concise on-slice label (same prize, short wording - never a different
// prize).
const LADDER = [
  { min: 1, max: 1000, name: 'Free Delivery', wheel: 'FREE DELIVERY' },
  { min: 1000, max: 5000, name: 'Mobile Charm', wheel: 'MOBILE CHARM' },
  { min: 5000, max: 10000, name: 'Rs 500 off on next purchase', wheel: 'RS 500 OFF' },
  { min: 10000, max: 15000, name: 'Airdopes', wheel: 'AIRDOPES' },
  { min: 15000, max: 25000, name: 'Rs 1000 off on your next purchase', wheel: 'RS 1000 OFF' },
  { min: 25000, max: 2000000, name: '10% flat discount on current bill', wheel: '10% OFF BILL' },
  { min: 2000000, max: 2500000, name: 'Flat 25% Off on your current invoice', wheel: '25% OFF INVOICE' },
  { min: 2500000, max: null, name: 'Flat 40% off on your current invoice', wheel: '40% OFF INVOICE' },
]

const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
if (!keys.url || !keys.service || !keys.url.includes(REF_BY_ENV[ENV])) {
  console.error('Refusing to run: keys file does not point at the requested environment')
  process.exit(2)
}
console.log(`INFO  target environment: ${ENV}`)
if (DRY_RUN) console.log('INFO  dry run - no writes will be made')

const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

const { data: store, error: storeErr } = await service
  .from('stores')
  .select('id, slug, name, google_review_url, min_spin_amount')
  .eq('slug', SLUG)
  .maybeSingle()
if (storeErr) throw new Error(storeErr.message)
if (!store) throw new Error(`no store with slug ${SLUG}`)
console.log(`PASS  shop resolved: ${store.name} (${store.slug})`)
if (store.min_spin_amount && store.min_spin_amount > 1) {
  console.warn(`WARN  store min_spin_amount is ${store.min_spin_amount}; purchases below it will not spin`)
}

const { data: oldRewards } = await service.from('rewards').select('id, name, active').eq('store_id', store.id)
const { data: oldTiers } = await service.from('reward_tiers').select('min_amount, max_amount, reward_id').eq('store_id', store.id)
console.log(`INFO  before-state: ${oldRewards?.length ?? 0} rewards [${(oldRewards ?? []).map((r) => r.name).join(', ')}], ${oldTiers?.length ?? 0} tiers, review url ${store.google_review_url ? 'set' : 'unset'}, min_spin_amount ${store.min_spin_amount}`)
if (DRY_RUN) {
  console.log('INFO  dry run complete')
  process.exit(0)
}

// Replace the catalog as a whole. Historical submissions hold a foreign key
// to rewards, so previously claimed rewards are RETIRED (active=false) and
// kept for the claim history instead of being deleted.
const rewardIds = (oldRewards ?? []).map((r) => r.id)
if (rewardIds.length) {
  const { error: dtErr } = await service.from('reward_tiers').delete().eq('store_id', store.id).in('reward_id', rewardIds)
  if (dtErr) throw new Error(`reward_tiers delete: ${dtErr.message}`)
  const { error: drErr } = await service.from('rewards').update({ active: false }).eq('store_id', store.id).in('id', rewardIds)
  if (drErr) throw new Error(`rewards retire: ${drErr.message}`)
  console.log(`PASS  previous catalog retired (${rewardIds.length} rewards kept for claim history)`)
}

const { data: inserted, error: rErr } = await service
  .from('rewards')
  .insert(LADDER.map((row) => ({ store_id: store.id, name: row.name, wheel_label: row.wheel, description: row.name, active: true })))
  .select('id, name')
if (rErr) throw new Error(`rewards insert: ${rErr.message}`)
const idByName = new Map(inserted.map((r) => [r.name, r.id]))

const { error: tErr } = await service.from('reward_tiers').insert(
  LADDER.map((row) => ({
    store_id: store.id,
    min_amount: row.min,
    max_amount: row.max,
    reward_id: idByName.get(row.name),
    target_segment: 0,
    active: true,
  })),
)
if (tErr) throw new Error(`reward_tiers insert: ${tErr.message}`)
console.log(`PASS  rewards + tiers written (${LADDER.length} bands)`)

const { error: uErr } = await service.from('stores').update({ google_review_url: GOOGLE_REVIEW_URL, min_spin_amount: 1 }).eq('id', store.id)
if (uErr) throw new Error(`stores update: ${uErr.message}`)
console.log('PASS  Google review link set; spin floor lowered to Re 1 so the Free Delivery band (0-1,000) can spin')

const { data: afterTiers } = await service
  .from('reward_tiers')
  .select('min_amount, max_amount, rewards(name)')
  .eq('store_id', store.id)
  .order('min_amount')
for (const t of afterTiers ?? []) {
  const label = t.max_amount === null ? `${t.min_amount}+` : `${t.min_amount}-${t.max_amount}`
  console.log(`INFO  ${label.padEnd(18)} -> ${t.rewards?.name}`)
}
console.log(`RESULT catalog configured for ${SLUG} on ${ENV}`)
