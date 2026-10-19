#!/usr/bin/env node
// Create two REAL customer entries on STAGING for the vendor invoice-view/CSV
// check: one with invoice details, one without. Prints their ids so the caller
// can verify the vendor UI/CSV and then delete exactly these rows.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const keys = JSON.parse(readFileSync(join(process.env.TEMP ?? '/tmp', 'jriq-keys-staging.json'), 'utf8'))
if (keys.url.includes('awshkiwqkuubkhecszzk')) {
  console.error('Refusing to write synthetic rows to production')
  process.exit(2)
}
const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })

const base = {
  p_store_slug: 'pashupati1',
  p_purchase_amount: 2500,
}
const withInvoice = await anon.rpc('submit_customer_entry', {
  ...base,
  p_request_id: randomUUID(),
  p_customer_name: 'QA Invoice Visible',
  p_customer_phone: '70' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
  p_invoice_details: 'INV-QA-77881',
})
const withoutInvoice = await anon.rpc('submit_customer_entry', {
  ...base,
  p_request_id: randomUUID(),
  p_customer_name: 'QA Invoice Missing',
  p_customer_phone: '70' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
})
if (withInvoice.error || withoutInvoice.error) {
  console.error('submit failed:', withInvoice.error?.message, withoutInvoice.error?.message)
  process.exit(1)
}
console.log(
  JSON.stringify(
    {
      withInvoice: {
        id: withInvoice.data[0].submission_id,
        claim: withInvoice.data[0].claim_code,
        invoice: 'INV-QA-77881',
      },
      withoutInvoice: {
        id: withoutInvoice.data[0].submission_id,
        claim: withoutInvoice.data[0].claim_code,
      },
    },
    null,
    2,
  ),
)
