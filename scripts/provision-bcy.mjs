#!/usr/bin/env node
// One-off provisioning: BCY Jewellers Private Limited (slug `bcy`) on
// production. Mirrors scripts/onboard-clients.mjs (shop via create_shop with an
// EMPTY tier list - no brackets, no prizes until the owner publishes) plus the
// gift-columns delivery state:
//
//   * stores.gift_columns = 8 BLANK drafts, published = null (never published).
//     The owner fills the eight gift fields in the admin and publishes; until
//     then customers see the designed "REWARDS ARE BEING SET UP" state and no
//     prize exists anywhere (5A: empty fields can never be prizes/segments).
//   * google_review_url = the shop's exact BCY Google review link.
//   * status 'active' so https://jriq.in/BCY serves the campaign.
//
// Owner login (bcy@123 / the requested password) is NOT created here - use the
// existing runbook after this script:
//   node scripts/set-owner-login.mjs bcy@123 <password> bcy <keys-file>
//   node scripts/upload-store-logo.mjs --slug bcy --file brand-assets/bcy-jewellers-logo.png --env production
//
// NOTHING sensitive is printed. Idempotent: re-running updates settings only.
//
// Usage:
//   node scripts/provision-bcy.mjs [--env production] [--keys <keys.json>] [--dry-run]

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const argValue = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY_RUN = args.includes('--dry-run')
const TARGET_ENV = argValue('--env') || 'production'
const KEYS_FILE = argValue('--keys') ?? join(tmpdir(), 'jriq-keys-prod.json')
const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }

const SHOP = {
  name: 'BCY Jewellers Private Limited',
  slug: 'bcy',
  ownerEmail: 'owner-bcy@jriq-onboarding.test',
  // The exact BCY Google review link, verbatim.
  reviewUrl:
    'https://www.google.com/search?sxsrf=APpeQns6nSoD0N5HkMX_zLWNfsP1YA85KQ:1792314433084&kgmid=/g/11h4tb0x4t&q=BCY+Jewellers+Private+Limited&shem=dlvs1,epsd1,esd2e,ltae,rimspwouoe,sdpie&shndl=30&kgs=4855f2d85f9f2d2b&utm_source=dlvs1,epsd1,esd2e,ltae,rimspwouoe,sdpie,sh/x/loc/uni/m1/1#lrd=0x390949e0bf7a4d3b:0x4dda758096e46567,3',
  // Delivered state: 8 blank fields, never published.
  giftColumns: { draft: ['', '', '', '', '', '', '', ''], published: null, publishedAt: null },
}
const NEIGHBOURS = ['jolly-enterprises', 'shreejwellers', 'shreemanali', 'kohinoor', 'pashupati', 'pashupati1', 'pashupati2']

const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
const matchedEnv = Object.entries(REF_BY_ENV).find(([, ref]) => keys.url?.includes(ref))
if (!keys.url || !keys.service || !matchedEnv || matchedEnv[0] !== TARGET_ENV) {
  console.error('Refusing to run: keys file does not point at the requested environment')
  process.exit(2)
}
console.log(`INFO  target environment: ${TARGET_ENV}`)

const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const sessionClient = () => createClient(keys.url, keys.anon, { auth: { persistSession: false } })

let ok = 0
let fail = 0
function check(name, condition, detail = '') {
  if (condition) {
    ok += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

async function signIn(email, password) {
  const client = sessionClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in: ${error.message}`)
  void data
  return client
}

async function main() {
  // ---- neighbour snapshot (existing stores must not change) ----
  const { data: beforeRows, error: beforeErr } = await service
    .from('stores')
    .select('id, slug, name, subtitle, logo_url, google_review_url, status, active, min_spin_amount, gift_columns')
    .in('slug', NEIGHBOURS)
  if (beforeErr) throw new Error(`stores snapshot: ${beforeErr.message}`)
  const beforeBySlug = Object.fromEntries(beforeRows.map((r) => [r.slug, JSON.stringify(r)]))

  // ---- temporary platform administrator (self-cleaning) ----
  const tempEmail = `provision-bcy-${Date.now().toString(36)}@jriq-smoke.test`
  const tempPassword = `Provision-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}!x`
  const { data: tempUser, error: tempErr } = await service.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  })
  if (tempErr) throw new Error(`createUser: ${tempErr.message}`)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: tempUser.user.id })
  if (paErr) throw new Error(`platform_admins insert: ${paErr.message}`)
  const platform = await signIn(tempEmail, tempPassword)
  check('temporary platform administrator signed in', true)

  try {
    if (DRY_RUN) {
      console.log(`DRY   would provision ${SHOP.slug} (${SHOP.name}) with 8 blank gift fields`)
      return
    }

    // ---- 1. shop via create_shop (idempotent; NO brackets, NO prizes) ----
    const { data: shopRows, error: shopErr } = await platform.rpc('create_shop', {
      p_name: SHOP.name,
      p_slug: SHOP.slug,
      p_owner_email: SHOP.ownerEmail,
      p_tiers: [],
    })
    if (shopErr) throw new Error(`create_shop: ${shopErr.message}`)
    const row = Array.isArray(shopRows) ? shopRows[0] : shopRows
    check('create_shop returned the shop', row?.shop_slug === SHOP.slug, JSON.stringify(row ?? null))

    // ---- 2. settings through the RLS-checked stores update ----
    const { data: updated, error: updErr } = await platform
      .from('stores')
      .update({
        google_review_url: SHOP.reviewUrl,
        gift_columns: SHOP.giftColumns,
        status: 'active',
        active: true,
      })
      .eq('slug', SHOP.slug)
      .select('id, slug, name, google_review_url, gift_columns, status, active, min_spin_amount')
      .maybeSingle()
    if (updErr) throw new Error(`stores update: ${updErr.message}`)

    check('slug is exactly `bcy` (https://jriq.in/BCY resolves case-insensitively)', updated?.slug === 'bcy')
    check('name', updated?.name === SHOP.name, String(updated?.name))
    check('google review link stored verbatim', updated?.google_review_url === SHOP.reviewUrl)
    check('status active', updated?.status === 'active' && updated?.active === true)
    check(
      'gift fields delivered BLANK and never published',
      updated?.gift_columns?.published === null &&
        updated?.gift_columns?.publishedAt === null &&
        Array.isArray(updated?.gift_columns?.draft) &&
        updated.gift_columns.draft.length === 8 &&
        updated.gift_columns.draft.every((v) => v === ''),
      JSON.stringify(updated?.gift_columns ?? null),
    )

    // ---- 3. no prizes anywhere (5A delivery state) ----
    const [tiers, rewards, options] = await Promise.all([
      service.from('reward_tiers').select('id', { count: 'exact', head: true }).eq('store_id', updated.id),
      service.from('rewards').select('id', { count: 'exact', head: true }).eq('store_id', updated.id),
      service.from('tier_gift_options').select('id', { count: 'exact', head: true }).eq('store_id', updated.id),
    ])
    check(
      'no brackets / rewards / gift options exist before first publish',
      tiers.count === 0 && rewards.count === 0 && (options.count ?? 0) === 0,
      `tiers=${tiers.count} rewards=${rewards.count} options=${options.count ?? 0}`,
    )

    // ---- 4. neighbours unchanged ----
    const { data: afterRows, error: afterErr } = await service
      .from('stores')
      .select('id, slug, name, subtitle, logo_url, google_review_url, status, active, min_spin_amount, gift_columns')
      .in('slug', NEIGHBOURS)
    if (afterErr) throw new Error(`stores snapshot: ${afterErr.message}`)
    for (const r of afterRows) {
      check(`neighbour untouched: ${r.slug}`, beforeBySlug[r.slug] === JSON.stringify(r))
    }
  } finally {
    // self-cleaning temp platform administrator
    await service.auth.admin.deleteUser(tempUser.user.id)
    await service.from('platform_admins').delete().eq('user_id', tempUser.user.id)
    console.log('INFO  temporary platform administrator removed')
  }
}

await main()
console.log(`\n${ok} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log('NEXT  node scripts/set-owner-login.mjs bcy@123 <password> bcy')
console.log('NEXT  node scripts/upload-store-logo.mjs --slug bcy --file brand-assets/bcy-jewellers-logo.png --env production')
