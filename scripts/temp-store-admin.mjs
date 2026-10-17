#!/usr/bin/env node
// Temporary, self-cleaning shop-admin verification actor.
//
// Creates (and later removes) a THROWAWAY store-admin account for read-only UI
// verification of the authenticated shop-owner workspace (/{slug}/admin), the
// same temporary-actor discipline scripts/provision-shree.mjs and
// scripts/prod-smoke.mjs use for platform work: the actor is created through
// the auth admin API, linked to exactly one EXISTING shop via an additive
// `store_admins` row (never touching the real owner's row), and removed with
// proof of removal. No customer data is read into logs and no dashboard write
// is ever performed with the actor.
//
// Usage:
//   node scripts/temp-store-admin.mjs create --slug <shop-slug> --env staging|production
//        [--keys <keys.json>] [--out <creds.json>]
//   node scripts/temp-store-admin.mjs remove --slug <shop-slug> --env staging|production
//        [--keys <keys.json>] [--out <creds.json>] [--email <email>]
//
// Credentials for the actor are written to the --out JSON file (default
// %TEMP%/jriq-temp-store-admin.json). NOTHING sensitive is printed.
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const [sub, ...rest] = process.argv.slice(2)
function argValue(flag, argv = rest) {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null
}

const SLUG = argValue('--slug')
const TARGET_ENV = argValue('--env') || 'staging'
const KEYS_FILE = argValue('--keys')
const OUT = argValue('--out') ?? join(tmpdir(), 'jriq-temp-store-admin.json')
const EMAIL_OVERRIDE = argValue('--email')

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const EXPECTED_REF = REF_BY_ENV[TARGET_ENV]

let keys = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_KEY }
if (KEYS_FILE) {
  const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
}

if (sub !== 'create' && sub !== 'remove') {
  console.error('Usage: node scripts/temp-store-admin.mjs <create|remove> --slug <shop-slug> --env staging|production [--keys <keys.json>]')
  process.exit(2)
}
if (!SLUG) {
  console.error('Missing --slug')
  process.exit(2)
}
if (!keys.url || !keys.anon || !keys.service) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY (or a --keys file)')
  process.exit(2)
}
if (!EXPECTED_REF || !keys.url.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${keys.url} is not the ${TARGET_ENV} project (${EXPECTED_REF})`)
  process.exit(2)
}

const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

async function resolveStore() {
  const { data, error } = await service.from('stores').select('id, slug, name').eq('slug', SLUG)
  if (error) throw new Error(error.message)
  if ((data ?? []).length !== 1) throw new Error(`expected exactly one store with slug ${SLUG}, got ${(data ?? []).length}`)
  return data[0]
}

async function create() {
  const store = await resolveStore()
  const email = EMAIL_OVERRIDE ?? `ui-verify-${randomBytes(4).toString('hex')}@jriq-smoke.test`
  const password = `Verify-${randomBytes(9).toString('base64url')}!x`

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (createErr) throw new Error(`createUser: ${createErr.message}`)
  const userId = created.user.id

  const { error: linkErr } = await service
    .from('store_admins')
    .insert({ store_id: store.id, user_id: userId, email, role: 'owner' })
  if (linkErr) throw new Error(`store_admins insert: ${linkErr.message}`)

  // prove the actor resolves to exactly this shop (the app's adminStoreId path)
  const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
  const { error: signInErr } = await anon.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`actor sign-in: ${signInErr.message}`)
  const { data: membership } = await anon.from('store_admins').select('store_id').eq('user_id', userId).maybeSingle()
  if (membership?.store_id !== store.id) throw new Error('actor membership does not resolve to the target store')

  writeFileSync(OUT, JSON.stringify({ email, password, storeId: store.id, storeSlug: store.slug, userId }, null, 2), { mode: 0o600 })
  console.log(`PASS  temporary store admin created for ${store.name} (${SLUG}) on ${TARGET_ENV}`)
  console.log(`PASS  actor membership resolves to store ${store.id} (additive row; real owner untouched)`)
  console.log(`INFO  actor credentials written to ${OUT} (values not shown)`)
}

async function remove() {
  const store = await resolveStore()
  let email = EMAIL_OVERRIDE
  if (!email && existsSync(OUT)) email = JSON.parse(readFileSync(OUT, 'utf8')).email
  if (!email) throw new Error('no --email and no credentials file to identify the actor')

  const { data: users } = await service.auth.admin.listUsers()
  const user = (users?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (user) {
    await service.from('store_admins').delete().eq('store_id', store.id).eq('user_id', user.id)
    await service.auth.admin.deleteUser(user.id)
  }
  const { data: afterUsers } = await service.auth.admin.listUsers()
  const stillExists = (afterUsers?.users ?? []).some((u) => u.email?.toLowerCase() === email.toLowerCase())
  const { data: rows } = await service.from('store_admins').select('user_id').eq('store_id', store.id)
  console.log(`PASS  temporary store admin removed (auth user gone: ${!stillExists})`)
  console.log(`INFO  remaining shop admins: ${(rows ?? []).length} (real owner linkage preserved)`)
  if (existsSync(OUT)) rmSync(OUT)
}

if (sub === 'create') {
  create().catch((err) => {
    console.error(`FAIL  ${err?.message ?? err}`)
    process.exit(1)
  })
} else {
  remove().catch((err) => {
    console.error(`FAIL  ${err?.message ?? err}`)
    process.exit(1)
  })
}
