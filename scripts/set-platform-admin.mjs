#!/usr/bin/env node
// Create (or reset) a platform-admin login with KNOWN credentials on a known
// project - the same actor discipline as scripts/temp-platform-admin.mjs
// (auth user via the auth admin API + additive `platform_admins` row), but
// with a password the caller chooses so the account can be used for a manual
// or browser-driven verification session. Remove afterwards with
// scripts/temp-platform-admin.mjs remove (it deletes the same actor shape).
//
// Usage:
//   node scripts/set-platform-admin.mjs <email> <password> [keys-file]
//   (defaults to %TEMP%/jriq-keys-staging.json - STAGING ONLY)
//
// Key values and the password are NEVER printed.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const EMAIL = (process.argv[2] ?? '').trim()
const PASSWORD = process.argv[3] ?? ''
const KEYS_FILE = process.argv[4] ?? join(tmpdir(), 'jriq-keys-staging.json')
const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node scripts/set-platform-admin.mjs <email> <password> [keys-file]')
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

const { data: users } = await service.auth.admin.listUsers()
const existing = (users?.users ?? []).find((u) => u.email?.toLowerCase() === emailLower)

let userId
if (existing) {
  userId = existing.id
  const { error: updErr } = await service.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true })
  if (updErr) throw new Error(`updateUserById: ${updErr.message}`)
  console.log('INFO  account already existed; password reset to the requested value')
} else {
  const { data: created, error: createErr } = await service.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
  if (createErr) throw new Error(`createUser: ${createErr.message}`)
  userId = created.user.id
  console.log('PASS  platform-admin account created (e-mail auto-confirmed)')
}

const { error: linkErr } = await service.from('platform_admins').insert({ user_id: userId }).select('user_id')
if (linkErr && !linkErr.message.includes('duplicate')) throw new Error(`platform_admins insert: ${linkErr.message}`)
console.log('PASS  platform_admins membership present (additive row)')

const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
const { error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInErr) throw new Error(`platform-admin sign-in failed: ${signInErr.message}`)
console.log('PASS  platform-admin sign-in works with the requested credentials')
console.log(`INFO  login for ${matchedEnv[0] === 'production' ? 'https://jriq.in/platform/login' : 'the staging build /platform/login'} is ready`)
