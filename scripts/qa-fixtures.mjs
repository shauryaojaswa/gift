#!/usr/bin/env node
// QA fixture manager: synthetic prize configuration for test runs.
//
// `prizes up`   - per shop, creates two distinct synthetic rewards (labels
//                 "QA Gift <slug> A/B") and two purchase tiers (1,000-4,999
//                 -> A, 5,000+ -> B) so reward journeys can be exercised
//                 deterministically and cross-tenant isolation can be proven
//                 under load (each shop's rewards carry its own slug).
// `prizes down` - removes exactly those synthetic rewards and tiers (tiers
//                 first; submissions referencing them must be removed by the
//                 caller first - reward_id is ON DELETE RESTRICT).
//
// Staging-only by default (--allow-any-env to override for throwaway rigs).
// Nothing is read into logs beyond names/counts.
//
// Usage:
//   node scripts/qa-fixtures.mjs prizes up|down --env staging [--keys <keys.json>]
//        [--slugs a,b,c] [--label "QA Gift"]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [what, action, ...rest] = process.argv.slice(2)
function argValue(flag, fallback = null) {
  const i = rest.indexOf(flag)
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback
}
if (what !== 'prizes' || (action !== 'up' && action !== 'down')) {
  console.error('Usage: node scripts/qa-fixtures.mjs prizes <up|down> --env staging [--keys <keys.json>] [--slugs a,b] [--label "QA Gift"]')
  process.exit(2)
}
const TARGET_ENV = argValue('--env', 'staging')
if (TARGET_ENV === 'production' && !rest.includes('--allow-any-env')) {
  console.error('Refusing: qa-fixtures writes synthetic data and never runs against production')
  process.exit(2)
}
const KEYS_FILE = argValue('--keys')
const SLUGS = (argValue('--slugs', 'pashupati1,pashupati2,pashupati,shreemanali')).split(',').map((s) => s.trim())
const LABEL = argValue('--label', 'QA Gift')

let keys = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_KEY }
if (KEYS_FILE) {
  const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
}
if (!keys.url || !keys.service) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (or a --keys file)')
  process.exit(2)
}
const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

async function storeBySlug(slug) {
  const { data, error } = await service.from('stores').select('id, slug').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`no store ${slug}`)
  return data
}

async function up() {
  for (const slug of SLUGS) {
    const store = await storeBySlug(slug)
    // idempotent: clear any previous QA fixtures for this shop first
    await service.from('reward_tiers').delete().eq('store_id', store.id).in(
      'reward_id',
      (await service.from('rewards').select('id').eq('store_id', store.id).like('name', `${LABEL}%`)).data?.map((r) => r.id) ?? ['00000000-0000-0000-0000-000000000000'],
    )
    await service.from('rewards').delete().eq('store_id', store.id).like('name', `${LABEL}%`)

    const nameA = `${LABEL} ${slug} A`
    const nameB = `${LABEL} ${slug} B`
    const { data: rewards, error: rErr } = await service
      .from('rewards')
      .insert([
        { store_id: store.id, name: nameA, wheel_label: nameA, description: `Synthetic QA reward A for ${slug}`, active: true },
        { store_id: store.id, name: nameB, wheel_label: nameB, description: `Synthetic QA reward B for ${slug}`, active: true },
      ])
      .select('id, name')
    if (rErr) throw new Error(`rewards insert (${slug}): ${rErr.message}`)
    const rewardA = rewards.find((r) => r.name === nameA)
    const rewardB = rewards.find((r) => r.name === nameB)

    const { error: tErr } = await service.from('reward_tiers').insert([
      { store_id: store.id, min_amount: 1000, max_amount: 4999, reward_id: rewardA.id, target_segment: 0, active: true },
      { store_id: store.id, min_amount: 5000, max_amount: null, reward_id: rewardB.id, target_segment: 0, active: true },
    ])
    if (tErr) throw new Error(`reward_tiers insert (${slug}): ${tErr.message}`)
    console.log(`PASS  ${slug}: rewards [${nameA}, ${nameB}] + tiers [1000-4999 -> A, 5000+ -> B]`)
  }
  console.log(`RESULT prizes up complete for ${SLUGS.length} shops`)
}

async function down() {
  for (const slug of SLUGS) {
    const store = await storeBySlug(slug)
    const { data: rewards } = await service.from('rewards').select('id, name').eq('store_id', store.id).like('name', `${LABEL}%`)
    const ids = (rewards ?? []).map((r) => r.id)
    if (ids.length) {
      const { error: tErr } = await service.from('reward_tiers').delete().eq('store_id', store.id).in('reward_id', ids)
      if (tErr) throw new Error(`reward_tiers delete (${slug}): ${tErr.message}`)
      const { error: rErr } = await service.from('rewards').delete().eq('store_id', store.id).in('id', ids)
      if (rErr) throw new Error(`rewards delete (${slug}): ${rErr.message}`)
    }
    console.log(`PASS  ${slug}: removed ${ids.length} synthetic rewards (+their tiers)`)
  }
  console.log(`RESULT prizes down complete for ${SLUGS.length} shops`)
}

;(action === 'up' ? up : down)().catch((err) => {
  console.error(`FAIL  ${err?.message ?? err}`)
  process.exit(1)
})
