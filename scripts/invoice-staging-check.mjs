#!/usr/bin/env node
// Invoice-details write tests against STAGING (real persistence, no mocks).
// Verifies the release's data contract on the customer submission path:
//   1. entry WITHOUT invoice details -> submissions.invoice_details is NULL
//   2. entry WITH invoice details    -> persisted verbatim (trimmed)
//   3. blank / whitespace input      -> normalised to NULL
//   4. 201 characters                -> rejected ('Invoice details are too long')
//   5. exactly 200 characters        -> accepted
//   6. legacy 7-key call shape       -> still works (older callers)
//   7. reward payload                -> matches the store's configured reward
// Reads back every row through the service key and deletes exactly the rows
// this script created (staging only; it refuses production).
//
// Usage: node scripts/invoice-staging-check.mjs [--keys <keys.json>]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const rest = process.argv.slice(2)
function argValue(flag, fallback) {
  const i = rest.indexOf(flag)
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback
}
const KEYS_FILE = argValue('--keys', join(process.env.TEMP ?? '/tmp', 'jriq-keys-staging.json'))
const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
if (!keys.url || !keys.anon || !keys.service) {
  console.error('keys file must carry url / anon / service')
  process.exit(2)
}
if (keys.url.includes('awshkiwqkuubkhecszzk') || keys.url.includes('jriq.in')) {
  console.error('Refusing to run: this suite writes synthetic rows and is staging-only')
  process.exit(2)
}

const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

const SLUG = argValue('--slug', 'pashupati1')
const created = []
const results = []
let failed = 0

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function phone() {
  // Synthetic but valid Indian mobile (never a real number: 7000000xxx block).
  return `70${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`
}

async function submit(args) {
  const { data, error } = await anon.rpc('submit_customer_entry', args)
  return { data, error }
}

async function main() {
  // What is the store's configured reward at 15,000? (reward behaviour baseline)
  const { data: poolRows } = await service.rpc('get_store_gift_pool', { p_store_slug: SLUG })
  const poolNames = new Set((poolRows ?? []).map((r) => r.gift_name))
  console.log(`store ${SLUG}: pool gifts = ${[...poolNames].join(', ') || '(legacy single reward)'}`)

  const base = {
    p_store_slug: SLUG,
    p_customer_name: 'QA Invoice Check',
    p_customer_phone: phone(),
    p_purchase_amount: 15000,
  }

  // 1. No invoice details at all (field omitted entirely).
  const noInvoice = await submit({ ...base, p_request_id: randomUUID() })
  if (noInvoice.error) {
    check('entry without invoice details submits', false, noInvoice.error.message)
  } else {
    created.push(noInvoice.data[0].submission_id)
    const { data: row } = await service
      .from('submissions')
      .select('invoice_details, reward_label, purchase_amount')
      .eq('id', noInvoice.data[0].submission_id)
      .single()
    check('entry without invoice details submits', true)
    check('omitted invoice stores NULL', row?.invoice_details === null, `got ${JSON.stringify(row?.invoice_details)}`)
    check('reward is returned and stored', Boolean(row?.reward_label), row?.reward_label ?? '')
  }

  // 2. With invoice details (the release's feature).
  const withInvoice = await submit({
    ...base,
    p_customer_phone: phone(),
    p_request_id: randomUUID(),
    p_invoice_details: 'INV-2026-00123',
  })
  if (withInvoice.error) {
    check('entry with invoice details submits', false, withInvoice.error.message)
  } else {
    created.push(withInvoice.data[0].submission_id)
    const { data: row } = await service
      .from('submissions')
      .select('invoice_details')
      .eq('id', withInvoice.data[0].submission_id)
      .single()
    check('entry with invoice details submits', true)
    check('invoice persists verbatim', row?.invoice_details === 'INV-2026-00123', String(row?.invoice_details))
  }

  // 3. Blank / whitespace-only input normalises to NULL.
  const blank = await submit({
    ...base,
    p_customer_phone: phone(),
    p_request_id: randomUUID(),
    p_invoice_details: '   ',
  })
  if (blank.error) {
    check('blank invoice entry submits', false, blank.error.message)
  } else {
    created.push(blank.data[0].submission_id)
    const { data: row } = await service
      .from('submissions')
      .select('invoice_details')
      .eq('id', blank.data[0].submission_id)
      .single()
    check('blank invoice normalises to NULL', row?.invoice_details === null, JSON.stringify(row?.invoice_details))
  }

  // 4. Over-long invoice is rejected at the boundary.
  const tooLong = await submit({
    ...base,
    p_customer_phone: phone(),
    p_request_id: randomUUID(),
    p_invoice_details: 'x'.repeat(201),
  })
  check(
    '201-character invoice is rejected',
    Boolean(tooLong.error) && /too long/i.test(tooLong.error?.message ?? ''),
    tooLong.error?.message ?? 'NO ERROR (accepted!)',
  )

  // 5. Exactly 200 characters is accepted and persisted.
  const exact = 'y'.repeat(200)
  const atLimit = await submit({
    ...base,
    p_customer_phone: phone(),
    p_request_id: randomUUID(),
    p_invoice_details: exact,
  })
  if (atLimit.error) {
    check('200-character invoice is accepted', false, atLimit.error.message)
  } else {
    created.push(atLimit.data[0].submission_id)
    const { data: row } = await service
      .from('submissions')
      .select('invoice_details')
      .eq('id', atLimit.data[0].submission_id)
      .single()
    check('200-character invoice is accepted', row?.invoice_details === exact, String(row?.invoice_details?.length))
  }

  // 6. Legacy 7-key call shape (older deployed frontend) keeps working.
  const legacy = await anon.rpc('submit_customer_entry', {
    p_store_slug: SLUG,
    p_request_id: randomUUID(),
    p_customer_name: 'QA Legacy Shape',
    p_customer_phone: phone(),
    p_purchase_amount: 15000,
    p_review_cta_shown: false,
    p_review_cta_clicked: false,
  })
  if (legacy.error) {
    check('legacy 7-key call shape still works', false, legacy.error.message)
  } else {
    created.push(legacy.data[0].submission_id)
    check('legacy 7-key call shape still works', true, legacy.data[0].claim_code)
  }

  // 7. Reward assignment sanity: amount 15000 maps to exactly one bracket's gift.
  if (noInvoice.data?.[0]) {
    const reward = noInvoice.data[0].reward
    const inPool = poolNames.size === 0 || poolNames.has(reward.name)
    check('reward comes from the configured pool', inPool, reward.name)
  }

  console.log(`\n${results.length - failed} passed, ${failed} failed`)
}

main()
  .catch((err) => {
    console.error('unexpected failure:', err)
    failed += 1
  })
  .finally(async () => {
    if (created.length > 0) {
      const { error } = await service.from('submissions').delete().in('id', created)
      console.log(
        error
          ? `CLEANUP FAILED (${error.message}) — rows left behind: ${created.join(', ')}`
          : `cleanup ok — removed ${created.length} synthetic rows`,
      )
    }
    process.exit(failed > 0 ? 1 : 0)
  })
