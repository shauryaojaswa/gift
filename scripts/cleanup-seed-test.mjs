#!/usr/bin/env node
// Cleanup for the seeded staging walkthrough (2026-10-18) - removes exactly
// what scripts/set-owner-login.mjs and the two UI journeys created, nothing
// else:
//
//   1. the two synthetic customer submissions (matched by exact claim code AND
//      exact customer name - submissions first, reward_id is ON DELETE
//      RESTRICT). Append-only audit rows are deliberately NOT touched.
//   2. the staging owner account created for the walkthrough (auth user +
//      its store_admins membership row).
//   3. the store_owner_invitations row restored to its captured before-state
//      (status=pending, email=owner-shreemanali@jriq-onboarding.test).
//
// Reward fixtures are removed separately by scripts/qa-fixtures.mjs prizes
// down (run this first - same RESTRICT reason).
//
// Usage:
//   node scripts/cleanup-seed-test.mjs [keys-file]
//   (defaults to %TEMP%/jriq-keys-staging.json - STAGING ONLY, hardcoded
//    refusal of the production project)
//
// Key values and credentials are NEVER printed.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const KEYS_FILE = process.argv[2] ?? join(tmpdir(), 'jriq-keys-staging.json')
const PROD_REF = 'awshkiwqkuubkhecszzk'
const STAGING_REF = 'wpytaorgiqkfnifsuhax'
const CLAIMS = ['GIFT-9C1B6712', 'GIFT-D0722E28']
const NAMES = ['QA Seed Walkthrough', 'QA Seed Walkthrough B']
const OWNER_EMAIL = 'manali@123'
const SLUG = 'shreemanali'
const INVITE_EMAIL_BEFORE = 'owner-shreemanali@jriq-onboarding.test'
const INVITE_STATUS_BEFORE = 'pending'

const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
if (!keys.url?.includes(STAGING_REF) || keys.url.includes(PROD_REF)) {
  console.error('Refusing to run: this cleanup is staging-only')
  process.exit(2)
}
const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

const { data: stores, error: storeErr } = await service
  .from('stores').select('id').eq('slug', SLUG)
if (storeErr) throw new Error(storeErr.message)
if ((stores ?? []).length !== 1) throw new Error(`expected exactly one ${SLUG} store`)
const storeId = stores[0].id

// 1. the two synthetic submissions (exact match on both identifiers)
const { data: subs, error: subErr } = await service
  .from('submissions')
  .select('id, customer_name, coupon_code')
  .eq('store_id', storeId)
  .in('coupon_code', CLAIMS)
  .in('customer_name', NAMES)
if (subErr) throw new Error(subErr.message)
if ((subs ?? []).some((s) => !CLAIMS.includes(s.coupon_code) || !NAMES.includes(s.customer_name))) {
  throw new Error('refusing: matched a row outside the exact identifier set')
}
const { error: delErr } = await service.from('submissions').delete().in('id', (subs ?? []).map((s) => s.id))
if (delErr) throw new Error(delErr.message)
console.log(`PASS  removed ${subs.length} synthetic submissions (audit trail left intact)`)

// 2. the walkthrough owner account + its membership
const { data: users } = await service.auth.admin.listUsers()
const user = (users?.users ?? []).find((u) => u.email?.toLowerCase() === OWNER_EMAIL)
if (user) {
  const { error: memErr } = await service.from('store_admins').delete().eq('store_id', storeId).eq('user_id', user.id)
  if (memErr) throw new Error(memErr.message)
  const { error: delUserErr } = await service.auth.admin.deleteUser(user.id)
  if (delUserErr) throw new Error(delUserErr.message)
  console.log('PASS  walkthrough owner account and membership removed')
} else {
  console.log('INFO  no walkthrough owner account found (already clean)')
}

// 3. invitation restored to its captured before-state
const { error: invErr } = await service
  .from('store_owner_invitations')
  .update({ status: INVITE_STATUS_BEFORE, email: INVITE_EMAIL_BEFORE, linked_at: null })
  .eq('store_id', storeId)
if (invErr) throw new Error(invErr.message)
const { data: invAfter } = await service
  .from('store_owner_invitations').select('status, email').eq('store_id', storeId).maybeSingle()
if (invAfter?.status !== INVITE_STATUS_BEFORE || invAfter?.email !== INVITE_EMAIL_BEFORE) {
  throw new Error(`invitation restore mismatch: ${invAfter?.status} ${invAfter?.email}`)
}
console.log(`PASS  invitation restored: status=${invAfter.status} email=${invAfter.email}`)

const { data: members } = await service.from('store_admins').select('email').eq('store_id', storeId)
console.log(`INFO  remaining memberships on ${SLUG}: ${(members ?? []).map((m) => m.email).join(', ') || '(none)'} (temp-actor removed separately)`)
