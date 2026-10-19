#!/usr/bin/env node
// One-off provisioning: create (or reset) a shop-owner login and link it to an
// existing shop on production. Mirrors the bookkeeping `link_store_owner`
// performs (store_admins row + store_owner_invitations upsert -> 'linked'),
// with the same additive-only discipline as scripts/temp-store-admin.mjs.
//
// NOTHING sensitive is printed: keys and the password never reach stdout.
//
// Usage:
//   node scripts/set-owner-login.mjs <email> <password> [slug] [keys-file]
//
// Keys: defaults to %TEMP%/jriq-keys-prod.json ({url, anon, service}); a keys
// file for another KNOWN project may be passed explicitly. Key values are
// NEVER printed. The invitation row's prior state is printed (non-sensitive)
// so the caller can restore it if the link is temporary.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const EMAIL = (process.argv[2] ?? '').trim()
const PASSWORD = process.argv[3] ?? ''
const SLUG = (process.argv[4] ?? 'shreemanali').trim()
const KEYS_FILE = process.argv[5] ?? join(tmpdir(), 'jriq-keys-prod.json')
const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node scripts/set-owner-login.mjs <email> <password> [slug] [keys-file]')
  process.exit(2)
}

const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
const matchedEnv = Object.entries(REF_BY_ENV).find(([, ref]) => keys.url?.includes(ref))
if (!keys.url || !keys.service || !matchedEnv) {
  console.error('Refusing to run: keys file does not point at a known project')
  process.exit(2)
}
console.log(`INFO  target environment: ${matchedEnv[0]}`)

const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const emailLower = EMAIL.toLowerCase()

// 1. Resolve the shop --------------------------------------------------------
const { data: stores, error: storeErr } = await service
  .from('stores').select('id, slug, name').eq('slug', SLUG)
if (storeErr) throw new Error(`stores lookup: ${storeErr.message}`)
if ((stores ?? []).length !== 1) throw new Error(`expected exactly one store with slug ${SLUG}, got ${(stores ?? []).length}`)
const store = stores[0]
console.log(`PASS  shop resolved: ${store.name} (${store.slug})`)

// 2. Auth account (create if missing, otherwise reset to the requested password)
const { data: users, error: listErr } = await service.auth.admin.listUsers()
if (listErr) throw new Error(`listUsers: ${listErr.message}`)
const existing = (users?.users ?? []).find((u) => u.email?.toLowerCase() === emailLower)

let userId
if (existing) {
  userId = existing.id
  const { error: updErr } = await service.auth.admin.updateUserById(userId, {
    password: PASSWORD, email_confirm: true,
  })
  if (updErr) throw new Error(`updateUserById: ${updErr.message}`)
  console.log('INFO  account already existed; password reset to the requested value and e-mail confirmed')
} else {
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  })
  if (createErr) throw new Error(`createUser: ${createErr.message}`)
  userId = created.user.id
  console.log('PASS  owner account created (e-mail auto-confirmed)')
}

// 3. Owner link bookkeeping (identical effects to link_store_owner) ----------
const { error: linkErr } = await service
  .from('store_admins')
  .insert({ store_id: store.id, user_id: userId, email: emailLower, role: 'owner' })
  .select('store_id')
if (linkErr && !linkErr.message.includes('duplicate')) throw new Error(`store_admins insert: ${linkErr.message}`)
console.log('PASS  store_admins membership present (role owner)')

const { data: invRows } = await service
  .from('store_owner_invitations').select('store_id, email, status').eq('store_id', store.id)
if ((invRows ?? []).length > 0) {
  console.log(`INFO  invitation before-state: status=${invRows[0].status} email=${invRows[0].email}`)
  const { error: invErr } = await service
    .from('store_owner_invitations')
    .update({ status: 'linked', linked_at: new Date().toISOString(), email: emailLower })
    .eq('store_id', store.id)
  if (invErr) throw new Error(`invitation update: ${invErr.message}`)
} else {
  console.log('INFO  invitation before-state: (no row)')
  const { error: invErr } = await service
    .from('store_owner_invitations')
    .insert({ store_id: store.id, email: emailLower, status: 'linked', linked_at: new Date().toISOString() })
  if (invErr) throw new Error(`invitation insert: ${invErr.message}`)
}
console.log('PASS  owner invitation recorded as linked')

// 4. Verify the login works and resolves to exactly this shop ----------------
const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
const { error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInErr) throw new Error(`owner sign-in failed: ${signInErr.message}`)
console.log('PASS  owner sign-in works with the requested credentials')

const { data: memberships, error: memErr } = await service
  .from('store_admins').select('store_id, role').eq('user_id', userId)
if (memErr) throw new Error(`membership read-back: ${memErr.message}`)
const ids = (memberships ?? []).map((m) => m.store_id)
if (ids.length !== 1 || ids[0] !== store.id) {
  throw new Error(`membership resolves to ${ids.length} stores - expected exactly ${store.id}`)
}
console.log(`PASS  membership resolves to exactly this shop (${memberships[0].role})`)
console.log(`INFO  login for ${matchedEnv[0] === 'production' ? `https://jriq.in/${SLUG}/admin` : `the ${matchedEnv[0]} build /${SLUG}/admin`} is ready`)
