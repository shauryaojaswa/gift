#!/usr/bin/env node
// 2026-10-24: repairs the Pashupati tier rows BY PRIMARY KEY (no value-based
// matching): 10 tier rows per store -> the approved ladder, segments 0..9.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const argValue = (f) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const APPLY = args.includes('--apply')
const keys = JSON.parse(readFileSync(argValue('--keys') ?? '', 'utf8'))
if (!keys.url.includes('awshkiwqkuubkhecszzk')) throw new Error('not production')

const LADDER = [
  { name: 'Mug', min: 0, max: 25000 },
  { name: 'Cup Set', min: 25000, max: 50000 },
  { name: 'Varmora Tiffin', min: 50000, max: 100000 },
  { name: '₹999 Gift Voucher', min: 100000, max: 200000 },
  { name: 'Kettle', min: 200000, max: 300000 },
  { name: 'Iron', min: 300000, max: 400000 },
  { name: 'Omega Blower', min: 400000, max: 500000 },
  { name: 'Mixer', min: 500000, max: 600000 },
  { name: 'Induction', min: 600000, max: 700000 },
  { name: '100% Off Making Charges', min: 10000000, max: null },
]
const STORES = [
  { slug: 'pashupati1', id: 'eb2c608c-0248-4127-ad26-8b634ecef0a1' },
  { slug: 'pashupati2', id: '1842b881-1b8c-45e7-a5bf-553bddf0e597' },
  { slug: 'pashupati', id: 'da8b52d7-d227-414d-9965-bb8606054d6c' },
]
const db = createClient(keys.url, keys.service, { auth: { persistSession: false } })

for (const store of STORES) {
  const { data: rewards, error: e1 } = await db.from('rewards').select('id, name').eq('store_id', store.id)
  if (e1) throw new Error(e1.message)
  const byName = new Map((rewards ?? []).map((x) => [x.name, x.id]))
  const missing = LADDER.filter((l) => !byName.has(l.name))
  if (missing.length) throw new Error(`${store.slug}: rewards missing ${missing.map((m) => m.name)}`)

  const { data: tiers, error: e2 } = await db.from('reward_tiers').select('id, min_amount, max_amount, reward_id, target_segment, active').eq('store_id', store.id).order('min_amount')
  if (e2) throw new Error(e2.message)
  if ((tiers ?? []).length !== LADDER.length) {
    throw new Error(`${store.slug}: expected exactly ${LADDER.length} tier rows, found ${(tiers ?? []).length} - refusing`)
  }
  const rows = [...tiers].sort((a, b) => a.min_amount - b.min_amount || (a.id < b.id ? -1 : 1))
  console.log(`\n== ${store.slug} (10 rows, by id order within same min)`)
  rows.forEach((row, i) => {
    const want = LADDER[i]
    console.log(`  row ${i}: id=${row.id.slice(0, 8)} ₹${row.min_amount}-₹${row.max_amount ?? '∞'} seg${row.target_segment} -> ₹${want.min}-₹${want.max ?? '∞'} seg${i} ${want.name}`)
  })
  if (APPLY) {
    for (let i = 0; i < LADDER.length; i++) {
      const want = LADDER[i]
      const { error } = await db.from('reward_tiers').update({
        min_amount: want.min, max_amount: want.max, reward_id: byName.get(want.name), target_segment: i, active: true,
      }).eq('id', rows[i].id)
      if (error) throw new Error(`${store.slug} row ${i}: ${error.message}`)
    }
    // read-back: exactly the 10 distinct ranges
    const { data: check } = await db.from('reward_tiers').select('id, min_amount, max_amount, reward_id, target_segment, active').eq('store_id', store.id).order('min_amount')
    const mins = (check ?? []).map((x) => x.min_amount)
    const distinct = new Set(mins)
    if ((check ?? []).length !== 10 || distinct.size !== 10) {
      throw new Error(`${store.slug}: post-fix readback invalid (${check.length} rows, ${distinct.size} distinct mins)`)
    }
    const ok = (check ?? []).every((row, i) => row.min_amount === LADDER[i].min && (row.max_amount ?? null) === LADDER[i].max && byName.get(LADDER[i].name) === row.reward_id && row.target_segment === i)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${store.slug} read-back: 10 unique ranges in ladder order`)
  }
}
if (APPLY) console.log('FULLY REPAIRED')
