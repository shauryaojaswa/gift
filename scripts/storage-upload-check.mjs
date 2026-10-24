#!/usr/bin/env node
/**
 * Verifies the lazy Storage path of the hand-assembled Supabase client.
 *
 * The client loads @supabase/storage-js on demand, so the logo-upload path is
 * the one surface the normal journey never touches. This test exercises it
 * against production with a THROWAWAY object in the authorised owner's own
 * folder and removes the object again - no store configuration is changed and
 * no customer data is involved.
 *
 * Usage: node scripts/storage-upload-check.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { PostgrestClient } = require('@supabase/postgrest-js')
const { GoTrueClient } = require('@supabase/auth-js')

const keys = JSON.parse(readFileSync(join(tmpdir(), 'jriq-keys-prod.json'), 'utf8'))
const pw = readFileSync(join(tmpdir(), 'opencode', 'jriq-owner-pw.txt'), 'utf8').trim()
const base = new URL(keys.url.endsWith('/') ? keys.url : keys.url + '/')
const headers = { apikey: keys.anon, 'x-client-info': 'gift-customer-flow' }

const auth = new GoTrueClient({
  url: new URL('auth/v1', base).href,
  headers,
  storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
  autoRefreshToken: true,
  persistSession: true,
  storage: undefined,
})
const authedFetch = async (input, init) => {
  const h = new Headers(init?.headers)
  if (!h.has('apikey')) h.set('apikey', keys.anon)
  const { data } = await auth.getSession()
  const token = data.session?.access_token
  h.set('Authorization', token ? `Bearer ${token}` : `Bearer ${keys.anon}`)
  return fetch(input, { ...init, headers: h })
}
const rest = new PostgrestClient(new URL('rest/v1', base).href, { headers, schema: 'public', fetch: authedFetch })

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`PASS  ${name}${detail ? ' - ' + detail : ''}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' - ' + detail : ''}`)
  }
}

// the same lazy-loading pattern the app uses
let storageClient = null
const loadStorage = () => {
  storageClient ??= import('@supabase/storage-js').then(
    ({ StorageClient }) => new StorageClient(new URL('storage/v1', base).href, headers, authedFetch),
  )
  return storageClient
}

const { data: session, error: signInError } = await auth.signInWithPassword({ email: 'pashupati1@jriq.in', password: pw })
check('vendor sign-in for the storage path', !signInError && !!session.session, signInError ? signInError.message : '')
const { data: store } = await rest.from('stores').select('id').eq('slug', 'pashupati1').single()
check('own store id resolved', !!store?.id)

const bucket = 'store-logos'
const path = `${store.id}/audit-${Date.now()}.png`
const body = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const storage = await loadStorage()
check('storage client loads on demand', !!storage)

const { error: upErr } = await storage.from(bucket).upload(path, body, { contentType: 'image/png', upsert: false })
check('upload into the owner folder succeeds', !upErr, upErr ? upErr.message : '')

const { data: pub, error: pubErr } = await storage.from(bucket).getPublicUrl(path)
check('public URL is produced', !pubErr && !!pub?.publicUrl && pub.publicUrl.includes(path), pubErr ? pubErr.message : pub?.publicUrl?.slice(0, 80))

// the same public URL the client-side helper computes (string parity check)
const encodeStoragePath = (p) => p.split('/').map(encodeURIComponent).join('/')
const manual = encodeURI(`${base.href}storage/v1/object/public/${encodeStoragePath(`${bucket}/${path}`)}`)
check('client-computed public URL matches the storage client', manual === pub?.publicUrl, `${manual.slice(0, 90)} vs ${pub?.publicUrl?.slice(0, 90)}`)

// clean up the throwaway object
const { error: rmErr } = await storage.from(bucket).remove([path])
check('throwaway object removed', !rmErr, rmErr ? rmErr.message : '')

await auth.signOut()
console.log(`\nRESULT ${pass} passed, ${fail} failed (lazy storage path)`)
process.exit(fail === 0 ? 0 : 1)
