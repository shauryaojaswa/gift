#!/usr/bin/env node
// Deletes the visual-E2E journey submissions (5) + their rate-limit rows.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const keys = JSON.parse(readFileSync(process.env.TEMP + '\\jriq-keys-prod.json', 'utf8'))
const db = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const victims = [
  { store: 'pashupati2', id: '1842b881-1b8c-45e7-a5bf-553bddf0e597', phone: '9801223344' },
  { store: 'pashupati2', id: '1842b881-1b8c-45e7-a5bf-553bddf0e597', phone: '9801223356' },
  { store: 'pashupati1', id: 'eb2c608c-0248-4127-ad26-8b634ecef0a1', phone: '9801223366' },
  { store: 'pashupati', id: 'da8b52d7-d227-414d-9965-bb8606054d6c', phone: '9801223377' },
  { store: 'pashupati', id: 'da8b52d7-d227-414d-9965-bb8606054d6c', phone: '9801223357' },
]
let deleted = 0
for (const v of victims) {
  const got = await db.from('submissions').select('id').eq('store_id', v.id).eq('customer_phone', v.phone)
  if (got.error) throw new Error(got.error.message)
  for (const row of got.data ?? []) {
    const del = await db.from('submissions').delete().eq('id', row.id)
    if (del.error) throw new Error(del.error.message)
    deleted += 1
  }
  const digest = createHash('sha256').update(`${v.id}:${v.phone}`).digest('hex')
  const rl = await db.from('public_submission_rate_limits').delete().eq('store_id', v.id).eq('phone_digest', digest)
  if (rl.error) console.log(`note ${v.store}/${v.phone}: ${rl.error.message}`)
}
console.log(`deleted ${deleted} journey submissions + rate-limit rows`)
