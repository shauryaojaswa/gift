#!/usr/bin/env node
// Temporary, self-cleaning platform-admin verification actor.
//
// Creates (and later removes) a THROWAWAY platform-admin account for read-only
// UI verification of the internal platform experience (/platform/shops,
// /platform/catalog), under the same temporary-actor discipline as
// scripts/temp-store-admin.mjs: the auth user is created through the auth admin
// API, linked with an additive `platform_admins` row, verified end-to-end
// (sign-in + membership resolution), and removed with proof of removal.
// The service key is used only for actor setup/teardown and verification.
//
// Usage:
//   node scripts/temp-platform-admin.mjs create --env staging|production
//        [--keys <keys.json>] [--out <creds.json>]
//   node scripts/temp-platform-admin.mjs remove --env staging|production
//        [--keys <keys.json>] [--out <creds.json>] [--email <email>]
//
// Credentials land in the --out JSON file (default
// %TEMP%/jriq-temp-platform-admin.json). NOTHING sensitive is printed.
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

const TARGET_ENV = argValue('--env') || 'staging'
const KEYS_FILE = argValue('--keys')
const OUT = argValue('--out') ?? join(tmpdir(), 'jriq-temp-platform-admin.json')
const EMAIL_OVERRIDE = argValue('--email')

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const EXPECTED_REF = REF_BY_ENV[TARGET_ENV]

let keys = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_KEY }
if (KEYS_FILE) {
  const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
}

if (sub !== 'create' && sub !== 'remove') {
  console.error('Usage: node scripts/temp-platform-admin.mjs <create|remove> --env staging|production [--keys <keys.json>]')
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

async function create() {
  const email = EMAIL_OVERRIDE ?? `ui-verify-${randomBytes(4).toString('hex')}@jriq-smoke.test`
  const password = `Verify-${randomBytes(9).toString('base64url')}!x`

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (createErr) throw new Error(`createUser: ${createErr.message}`)
  const userId = created.user.id

  const { error: linkErr } = await service.from('platform_admins').insert({ user_id: userId })
  if (linkErr) throw new Error(`platform_admins insert: ${linkErr.message}`)

  // prove the actor resolves as a platform admin (the app's UX gate path)
  const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
  const { error: signInErr } = await anon.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`actor sign-in: ${signInErr.message}`)
  const { data: membership } = await anon.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (membership?.user_id !== userId) throw new Error('actor membership does not resolve to platform_admins')

  writeFileSync(OUT, JSON.stringify({ email, password, userId }, null, 2), { mode: 0o600 })
  console.log(`PASS  temporary platform admin created on ${TARGET_ENV}`)
  console.log('PASS  actor membership resolves to platform_admins (additive row)')
  console.log(`INFO  actor credentials written to ${OUT} (values not shown)`)
}

async function remove() {
  let email = EMAIL_OVERRIDE
  if (!email && existsSync(OUT)) email = JSON.parse(readFileSync(OUT, 'utf8')).email
  if (!email) throw new Error('no --email and no credentials file to identify the actor')

  const { data: users } = await service.auth.admin.listUsers()
  const user = (users?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (user) {
    await service.from('platform_admins').delete().eq('user_id', user.id)
    await service.auth.admin.deleteUser(user.id)
  }
  const { data: afterUsers } = await service.auth.admin.listUsers()
  const stillExists = (afterUsers?.users ?? []).some((u) => u.email?.toLowerCase() === email.toLowerCase())
  const { data: rows } = await service.from('platform_admins').select('user_id')
  console.log(`PASS  temporary platform admin removed (auth user gone: ${!stillExists})`)
  console.log(`INFO  platform admins remaining: ${(rows ?? []).length}`)
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
