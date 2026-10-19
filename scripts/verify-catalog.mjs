#!/usr/bin/env node
// Verify that the reward engine assigns exactly the configured reward for
// every purchase band (including both sides of each boundary) through the
// REAL customer RPC (submit_customer_entry). Self-cleaning: the synthetic
// verification submissions are deleted afterwards.
//
// Usage:
//   node scripts/verify-catalog.mjs --env staging|production [--keys <keys.json>] [--slug shreemanali]
//   (production requires --confirm-production)

import { readFileSync } from 'node:fs'
import { randomUUID, randomInt } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const argValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const ENV = argValue('--env', 'staging')
const SLUG = argValue('--slug', 'shreemanali')
const KEYS_FILE = argValue('--keys', join(tmpdir(), ENV === 'production' ? 'jriq-keys-prod.json' : 'jriq-keys-staging.json'))
if (!REF_BY_ENV[ENV]) { console.error(`Unknown --env ${ENV}`); process.exit(2) }
if (ENV === 'production' && !process.argv.includes('--confirm-production')) {
  console.error('Refusing to write verification rows into production without --confirm-production')
  process.exit(2)
}

// [purchase amount, expected reward name] - every band plus both boundary
// sides, per the configured ladder (half-open [min, max)).
const PROBES = [
  [500, 'Free Delivery'],
  [999, 'Free Delivery'],
  [1000, 'Mobile Charm'],
  [3000, 'Mobile Charm'],
  [4999, 'Mobile Charm'],
  [5000, 'Rs 500 off on next purchase'],
  [9999, 'Rs 500 off on next purchase'],
  [10000, 'Airdopes'],
  [14999, 'Airdopes'],
  [15000, 'Rs 1000 off on your next purchase'],
  [24999, 'Rs 1000 off on your next purchase'],
  [25000, '10% flat discount on current bill'],
  [50000, '10% flat discount on current bill'],
  [1999999, '10% flat discount on current bill'],
  [2000000, 'Flat 25% Off on your current invoice'],
  [2499999, 'Flat 25% Off on your current invoice'],
  [2500000, 'Flat 40% off on your current invoice'],
  [2700000, 'Flat 40% off on your current invoice'],
]

const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
if (!keys.url || !keys.anon || !keys.service || !keys.url.includes(REF_BY_ENV[ENV])) {
  console.error('Refusing to run: keys file does not point at the requested environment')
  process.exit(2)
}
console.log(`INFO  target environment: ${ENV}  shop: ${SLUG}`)
const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

const { data: store } = await service.from('stores').select('id').eq('slug', SLUG).maybeSingle()
if (!store) throw new Error(`no store ${SLUG}`)

let passed = 0
const created = []
for (const [amount, expected] of PROBES) {
  const res = await anon.rpc('submit_customer_entry', {
    p_store_slug: SLUG,
    p_request_id: randomUUID(),
    p_customer_name: `QA Band Verify ${amount}`,
    p_customer_phone: `9${randomInt(100000000, 999999999)}`,
    p_purchase_amount: amount,
    p_review_cta_shown: false,
    p_review_cta_clicked: false,
  })
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  const actual = row?.reward?.name ?? null
  const ok = !res.error && actual === expected && !!row?.claim_code
  if (row?.submission_id) created.push(row.submission_id)
  console.log(`${ok ? 'PASS' : 'FAIL'}  amount ${String(amount).padStart(9)} -> ${actual ?? `ERROR ${res.error?.message}`}${ok ? '' : ` (expected ${expected})`} claim=${row?.claim_code ?? '-'}`)
  if (ok) passed++
}

const { error: delErr } = await service.from('submissions').delete().eq('store_id', store.id).in('id', created)
console.log(delErr ? `WARN  cleanup failed: ${delErr.message}` : `PASS  cleaned up ${created.length} verification submissions`)
console.log(`RESULT verify-catalog: ${passed}/${PROBES.length} bands map to the configured reward`)
process.exit(passed === PROBES.length ? 0 : 1)
