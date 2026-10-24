#!/usr/bin/env node
// 2026-10-24: boundary matrix for the reconfigured Pashupati ladders.
// Calls the REAL production submit_customer_entry for 26 amounts x 3 stores,
// asserts the assigned reward (or the designed rejection), then deletes every
// test submission + its rate-limit row. Read-heavy, write-ephemeral.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const argValue = (f) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const CLEANUP_ONLY = args.includes('--cleanup-only')
const keys = JSON.parse(readFileSync(argValue('--keys') ?? '', 'utf8'))
if (!keys.url.includes('awshkiwqkuubkhecszzk')) throw new Error('not production')
const db = createClient(keys.url, keys.service, { auth: { persistSession: false } })

const STORES = [
  { slug: 'pashupati1', id: 'eb2c608c-0248-4127-ad26-8b634ecef0a1' },
  { slug: 'pashupati2', id: '1842b881-1b8c-45e7-a5bf-553bddf0e597' },
  { slug: 'pashupati', id: 'da8b52d7-d227-414d-9965-bb8606054d6c' },
]
// expect = reward name on success; null = designed rejection expected
const AMOUNTS = [
  { amt: 0, reject: 'Invalid customer entry' },
  { amt: 999, reject: 'No unique active reward is configured for this purchase amount' },
  { amt: 1000, expect: 'Mug', prefix: 'MUG' },
  { amt: 24000, expect: 'Mug' },
  { amt: 24999, expect: 'Mug' },
  { amt: 25000, expect: 'Cup Set', prefix: 'CUP' },
  { amt: 49999, expect: 'Cup Set' },
  { amt: 50000, expect: 'Varmora Tiffin', prefix: 'TIFFIN' },
  { amt: 99999, expect: 'Varmora Tiffin' },
  { amt: 100000, expect: '₹999 Gift Voucher', prefix: 'V999' },
  { amt: 199999, expect: '₹999 Gift Voucher' },
  { amt: 200000, expect: 'Kettle', prefix: 'KETTLE' },
  { amt: 299999, expect: 'Kettle' },
  { amt: 300000, expect: 'Iron', prefix: 'IRON' },
  { amt: 399999, expect: 'Iron' },
  { amt: 400000, expect: 'Omega Blower', prefix: 'OMEGA' },
  { amt: 499999, expect: 'Omega Blower' },
  { amt: 500000, expect: 'Mixer', prefix: 'MIXER' },
  { amt: 599999, expect: 'Mixer' },
  { amt: 600000, expect: 'Induction', prefix: 'INDUC' },
  { amt: 699999, expect: 'Induction' },
  { amt: 700000, reject: 'No unique active reward is configured for this purchase amount' },
  { amt: 750000, reject: 'No unique active reward is configured for this purchase amount' },
  { amt: 9999999, reject: 'No unique active reward is configured for this purchase amount' },
  { amt: 10000000, expect: '100% Off Making Charges', prefix: 'MC100' },
  { amt: 12500000, expect: '100% Off Making Charges' },
]

const created = [] // { submissionId, storeId, phone }
let pass = 0
let fail = 0

if (!CLEANUP_ONLY) {
  let seq = 0
  for (const store of STORES) {
    const lines = []
    for (const t of AMOUNTS) {
      seq += 1
      const phone = `98000${String(seq).padStart(5, '0')}` // unique per call, 10 digits
      const { data, error } = await db.rpc('submit_customer_entry', {
        p_store_slug: store.slug,
        p_request_id: crypto.randomUUID(),
        p_customer_name: 'E2E Boundary Test',
        p_customer_phone: phone,
        p_purchase_amount: t.amt,
        // pass every named param so the two overloads (7-arg / 8-arg) are not
        // ambiguous to PostgREST ("Could not choose the best candidate")
        p_review_cta_shown: false,
        p_review_cta_clicked: false,
        p_invoice_details: null,
      })
      let ok
      if (error) {
        const msg = error.message ?? String(error)
        ok = t.reject ? msg === t.reject : false
        lines.push(`${ok ? 'PASS' : 'FAIL'} ₹${t.amt} -> rejected: ${msg.slice(0, 64)}`)
      } else if (t.expect) {
        const row = (data ?? [])[0] ?? {}
        const name = row.reward?.name
        const claim = row.claim_code ?? ''
        ok = name === t.expect && (t.prefix ? claim.startsWith(`${t.prefix}-`) : true)
        lines.push(`${ok ? 'PASS' : 'FAIL'} ₹${t.amt} -> ${name} (claim ${claim})`)
        if (row.submission_id) created.push({ submissionId: row.submission_id, storeId: store.id, phone })
      } else {
        ok = false
        lines.push(`FAIL ₹${t.amt} -> unexpectedly AWARDED ${data?.[0]?.reward?.name}`)
        if (data?.[0]?.submission_id) created.push({ submissionId: data[0].submission_id, storeId: store.id, phone })
      }
      if (ok) pass += 1; else fail += 1
    }
    console.log(`\n== ${store.slug}`)
    for (const l of lines) console.log('  ' + l)
  }
  console.log(`\nMATRIX: ${pass} PASS / ${fail} FAIL; submissions created: ${created.length}`)
  // persist the cleanup manifest even on failure
  const manifest = argValue('--manifest') ?? 'logs\\pashupati-matrix-manifest.json'
  // use writeFileSync-free via fs (already imported readFileSync; add write)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(manifest, JSON.stringify({ created, pass, fail }, null, 2))
  console.log(`manifest -> ${manifest}`)
}

// ------------------------------------------------- cleanup (always available)
const manifestPath = CLEANUP_ONLY ? argValue('--manifest') : (argValue('--manifest') ?? 'logs\\pashupati-matrix-manifest.json')
if (!CLEANUP_ONLY) {
  // delete submissions + rate-limit rows for the created ones
  const ids = created.map((c) => c.submissionId)
  if (ids.length) {
    const del = await db.from('submissions').delete().in('id', ids)
    if (del.error) throw new Error(`cleanup submissions: ${del.error.message}`)
    console.log(`cleanup: deleted ${ids.length} test submissions`)
  }
  const digests = created.map((c) => ({
    store_id: c.storeId,
    phone_digest: createHash('sha256').update(`${c.storeId}:${c.phone}`).digest('hex'),
  }))
  for (const { store_id, phone_digest } of digests) {
    const d = await db.from('public_submission_rate_limits').delete().eq('store_id', store_id).eq('phone_digest', phone_digest)
    if (d.error && !d.error.message.includes('No rows')) console.log(`note: rate-limit cleanup ${d.error.message}`)
  }
  console.log('cleanup: rate-limit rows removed')
  // verify zero residue
  const chk = await db.from('submissions').select('id').in('id', ids)
  if (chk.error) throw new Error(chk.error.message)
  console.log(`residue check: ${(chk.data ?? []).length} submissions remaining (want 0)`)
}
