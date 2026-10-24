// One-off read-only backup helper for the 2026-10-24 Kohinoor go-live:
// exports the tables touched by the 2026101715* migration chain to JSON.
// Usage: node scripts/export-tables-snapshot.mjs --keys <keys.json> --out <file.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const argValue = (f) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const keys = JSON.parse(readFileSync(argValue('--keys'), 'utf8'))
const tables = [
  'stores',
  'gift_catalog',
  'reward_tiers',
  'tier_gift_options',
  'store_admins',
]
const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const out = { captured_at: new Date().toISOString(), project: keys.url, tables: {} }
for (const table of tables) {
  const { data, error, count } = await service.from(table).select('*', { count: 'exact' })
  if (error) throw new Error(`${table}: ${error.message}`)
  out.tables[table] = { count, rows: data }
}
writeFileSync(argValue('--out'), JSON.stringify(out, null, 2))
console.log(
  `snapshot written: ${out.tables.stores.count} stores, ${out.tables.gift_catalog.count} catalog gifts,`,
  `${out.tables.reward_tiers.count} tiers, ${out.tables.tier_gift_options.count} tier options,`,
  `${out.tables.store_admins.count} store admins`,
)
