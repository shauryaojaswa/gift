#!/usr/bin/env node
// Backup loader: snapshots the three Pashupati stores' ladder (stores/rewards/reward_tiers)
// before the 2026-10-24 reconfiguration. Read-only.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const argValue = (f) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const keys = JSON.parse(readFileSync(argValue('--keys'), 'utf8'))
const db = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const ids = {
  pashupati1: 'eb2c608c-0248-4127-ad26-8b634ecef0a1',
  pashupati2: '1842b881-1b8c-45e7-a5bf-553bddf0e597',
  pashupati: 'da8b52d7-d227-414d-9965-bb8606054d6c',
}
const out = { captured_at: new Date().toISOString(), stores: {} }
for (const [slug, id] of Object.entries(ids)) {
  const store = await db.from('stores').select('slug,min_spin_amount,gift_columns,location_label,google_review_url,spin_duration_ms').eq('id', id).single()
  if (store.error) throw new Error(store.error.message)
  const rewards = await db.from('rewards').select('*').eq('store_id', id)
  if (rewards.error) throw new Error(rewards.error.message)
  const tiers = await db.from('reward_tiers').select('*').eq('store_id', id).order('min_amount')
  if (tiers.error) throw new Error(tiers.error.message)
  out.stores[slug] = { store: store.data, rewards: rewards.data, tiers: tiers.data }
  console.log(`${slug}: ${rewards.data.length} rewards, ${tiers.data.length} tiers, min_spin=${store.data.min_spin_amount}`)
}
const outPath = argValue('--out') ?? `${process.env.USERPROFILE}\\backups\\jriq\\pashupati-ladder-pre-20261024.json`
writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`backup written -> ${outPath}`)
