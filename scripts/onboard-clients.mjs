#!/usr/bin/env node
// Onboard the four JRIQ jewellery client instances through the EXISTING
// platform onboarding workflows - no direct SQL, no invented data, no
// separate application. Exactly the authorised actor pattern
// scripts/provision-shree.mjs and scripts/prod-smoke.mjs establish:
//
//   1. temporary, self-cleaning platform administrator (auth + platform_admins)
//   2. shop                     -> create_shop RPC (p_tiers: [] - see below)
//   3. shop settings            -> the same RLS-checked stores update the
//                                  owner settings screen performs
//   4. activation               -> set_store_status RPC (except the unverified
//                                  third Pashupati location, which stays
//                                  'onboarding' = the designed inactive page)
//   5. verification              -> read-back + anon surface + neighbour-tenant
//                                  isolation (service key is read-only here)
//
// NO purchase brackets and NO prizes are saved. Prize ranges and gifts are the
// shop owner's decisions (final brief #4: the placeholder gift names must never
// be saved). p_tiers is passed as an empty list so create_shop's default
// bracket template is NOT applied either - a template of active ranges with no
// reward would violate "prevent ... active ranges that have no valid reward
// configured". Fresh shops therefore render the designed
// "REWARDS ARE BEING SET UP" state until their owner configures them.
//
// Shops (idempotent: create_shop returns the existing shop for a retried
// identical request and refuses a slug whose name differs):
//
//   pashupati1   Pashupati (A Unit of Benaras Swarn Kala Kendra LLP)
//                review: the PRIMARY Google listing (verified in-browser:
//                "Pashupati a unit of BSKK LLP", CID 0x96988d31a11155ac,
//                opens Google's Write-a-review dialog)
//   pashupati2   Pashupati (A Unit of Benaras Swarn Kala Kendra LLP), Lohta
//                review: the LOHTA listing's own destination (verified
//                in-browser: "... Lohta", CID 0x5e7aa4810675d71f - a different
//                listing from the primary one, never reused from it)
//   pashupati    Pashupati - third location. NO verified listing exists, so
//                google_review_url stays NULL and the shop stays 'onboarding'
//                (campaign inactive) until the location/listing is confirmed.
//                Never assign another branch's Google listing to this slug.
//   shreemanali  Shree Manali Ethnic Galore
//                review: the supplied Google Maps listing (verified in-browser:
//                "Shree Manali Ethnic Galore", CID 0x3f5167e78b4150a7; the
//                place page carries Google's own review entry). No logo was
//                supplied: the built-in fallback stays until the owner uploads
//                one from the dashboard.
//
// Owner accounts: no owner e-mail addresses were supplied with the brief, so
// each shop gets a clearly synthetic owner invitation
// (owner-<slug>@jriq-onboarding.test, status 'pending') - platform admins can
// re-point it to the real owner when known. The service key is used ONLY for
// actor setup/teardown and read-only verification; every write goes through
// RLS-checked authenticated RPCs/updates.
//
// Usage:
//   node scripts/onboard-clients.mjs --env staging|production [--keys <keys.json>]
//        [--only <slug>] [--dry-run]
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY in the environment
//   as an alternative to --keys ({url, anon, service}). Key values are NEVER
//   printed.
//
// Exit 0 = every check passed.

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

let URL = process.env.SUPABASE_URL
let ANON_KEY = process.env.SUPABASE_ANON_KEY
let SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const KEYS_FILE = argValue('--keys')
if (KEYS_FILE) {
  const { readFileSync } = await import('node:fs')
  const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  URL = URL || parsed.url
  ANON_KEY = ANON_KEY || parsed.anon
  SERVICE_KEY = SERVICE_KEY || parsed.service
}
const TARGET_ENV = argValue('--env') || 'staging'
const ONLY = argValue('--only')
const DRY_RUN = args.includes('--dry-run')
const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const EXPECTED_REF = REF_BY_ENV[TARGET_ENV]

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY (or --keys)')
  process.exit(2)
}
if (!EXPECTED_REF || !URL.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${URL} is not the ${TARGET_ENV} project (${EXPECTED_REF})`)
  process.exit(2)
}

// Verified Google destinations (each was opened in a real browser and matched
// the intended business + its own review entry). Clean canonical forms are
// stored (same query + same #lrd CID anchor / same place id) - the supplied
// URLs additionally carried volatile sxsrf/g_ep tracking parameters.
const REVIEW_PRIMARY =
  'https://www.google.com/search?hl=en-in&gl=in&q=Pashupati+a+unit+of+BSKK+LLP#lrd=0x398e3128434bb691:0x96988d31a11155ac,3'
const REVIEW_LOHTA =
  'https://www.google.com/search?hl=en-in&gl=in&q=Pashupati+a+unit+of+benaras+Swarn+Kala+Kendra+llp+Lohta#lrd=0x398e2de6beabada3:0x5e7aa4810675d71f,3'
const REVIEW_MANALI =
  'https://www.google.com/maps/place//@18.4810985,73.8639721,17z/data=!3m1!4b1!4m3!3m2!1s0x3bc2eaa1acc72927:0x3f5167e78b4150a7!12e1?entry=ttu'

const SHOPS = [
  {
    slug: 'pashupati1',
    name: 'Pashupati (A Unit of Benaras Swarn Kala Kendra LLP)',
    subtitle: null,
    reviewUrl: REVIEW_PRIMARY,
    reviewLabel: 'primary Pashupati listing (CID 0x96988d31a11155ac)',
    activate: true,
  },
  {
    slug: 'pashupati2',
    name: 'Pashupati (A Unit of Benaras Swarn Kala Kendra LLP)',
    subtitle: 'Lohta',
    reviewUrl: REVIEW_LOHTA,
    reviewLabel: 'Lohta listing (CID 0x5e7aa4810675d71f) - distinct from the primary',
    activate: true,
  },
  {
    slug: 'pashupati',
    name: 'Pashupati',
    subtitle: null,
    reviewUrl: null,
    reviewLabel: 'UNVERIFIED - no separate listing identified; left unset',
    activate: false, // stays 'onboarding' = campaign inactive until verified
  },
  {
    slug: 'shreemanali',
    name: 'Shree Manali Ethnic Galore',
    subtitle: null,
    reviewUrl: REVIEW_MANALI,
    reviewLabel: 'Google Maps listing (CID 0x3f5167e78b4150a7)',
    activate: true,
  },
].filter((s) => !ONLY || s.slug === ONLY)

const NEIGHBOURS = ['shreejwellers', 'jolly-enterprises']

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

function sessionClient() {
  return createClient(URL, ANON_KEY, { auth: { persistSession: false } })
}

async function signIn(email, password) {
  const client = sessionClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return client
}

async function main() {
  // ---- neighbour snapshot (tenant isolation: nobody else changes) ----
  const { data: beforeRows, error: beforeErr } = await service
    .from('stores')
    .select('id, slug, name, subtitle, logo_url, google_review_url, status, active, min_spin_amount')
    .in('slug', NEIGHBOURS)
  if (beforeErr) throw new Error(`stores snapshot: ${beforeErr.message}`)
  const beforeBySlug = Object.fromEntries(beforeRows.map((r) => [r.slug, JSON.stringify(r)]))

  // ---- temporary platform administrator (self-cleaning) ----
  const tempEmail = `onboard-clients-${Date.now().toString(36)}@jriq-smoke.test`
  const tempPassword = `Onboard-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}!x`
  const { data: tempUser, error: tempErr } = await service.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  })
  if (tempErr) throw new Error(`createUser ${tempEmail}: ${tempErr.message}`)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: tempUser.user.id })
  if (paErr) throw new Error(`platform_admins insert: ${paErr.message}`)
  const platform = await signIn(tempEmail, tempPassword)
  check('temporary platform administrator signed in', true)

  try {
    for (const shop of SHOPS) {
      const ownerEmail = `owner-${shop.slug}@jriq-onboarding.test`
      console.log(`\n--- ${shop.slug} (${shop.name}) ---`)
      if (DRY_RUN) {
        console.log(`DRY   would create/update ${shop.slug}; review=${shop.reviewLabel}`)
        continue
      }

      // ---- 1. shop via create_shop (idempotent, empty tier list on purpose) ----
      const { data: shopRows, error: shopErr } = await platform.rpc('create_shop', {
        p_name: shop.name,
        p_slug: shop.slug,
        p_owner_email: ownerEmail,
        p_tiers: [],
      })
      if (shopErr) throw new Error(`create_shop ${shop.slug}: ${shopErr.message}`)
      const row = Array.isArray(shopRows) ? shopRows[0] : shopRows
      check(`${shop.slug}: create_shop returned the shop`, row?.shop_slug === shop.slug, JSON.stringify(row ?? null))
      check(
        `${shop.slug}: owner invitation is pending (no owner e-mail supplied yet)`,
        row?.owner_link_status === 'pending' || row?.owner_link_status === 'linked',
        String(row?.owner_link_status),
      )
      const storeId = row.shop_id

      // ---- 2. settings through the RLS-checked stores update ----
      const settings = {
        subtitle: shop.subtitle,
        google_review_url: shop.reviewUrl,
      }
      const { data: updated, error: upErr } = await platform
        .from('stores')
        .update(settings)
        .eq('id', storeId)
        .select('id, subtitle, google_review_url')
      if (upErr) throw new Error(`stores update ${shop.slug}: ${upErr.message}`)
      check(`${shop.slug}: settings saved (subtitle + review destination)`, (updated ?? []).length === 1, JSON.stringify(updated))

      // ---- 3. activation (never for the unverified third location) ----
      if (shop.activate) {
        const { error: stErr } = await platform.rpc('set_store_status', {
          p_store_id: storeId,
          p_status: 'active',
        })
        if (stErr) throw new Error(`set_store_status ${shop.slug}: ${stErr.message}`)
      }
    }

    // ---- 4. verification read-back (service key, read-only) ----
    if (DRY_RUN) {
      console.log('\nDRY run complete - nothing was written.')
    } else {
    console.log('\n--- read-back verification ---')
    for (const shop of SHOPS) {
      const { data: rows, error } = await service
        .from('stores')
        .select('id, slug, name, subtitle, logo_url, google_review_url, status, active')
        .eq('slug', shop.slug)
      if (error) throw new Error(`read-back ${shop.slug}: ${error.message}`)
      const r = rows[0]
      if (!r) {
        check(`${shop.slug}: shop row exists`, false, 'missing')
        continue
      }
      check(`${shop.slug}: exact display name`, r?.name === shop.name, r?.name)
      check(`${shop.slug}: subtitle`, (r?.subtitle ?? null) === (shop.subtitle ?? null), String(r?.subtitle))
      check(
        `${shop.slug}: review destination (${shop.reviewLabel})`,
        (r?.google_review_url ?? null) === shop.reviewUrl,
        String(r?.google_review_url),
      )
      check(
        `${shop.slug}: status ${shop.activate ? "'active'" : "'onboarding' (campaign inactive by design)"}`,
        r?.status === (shop.activate ? 'active' : 'onboarding'),
        String(r?.status),
      )
      check(`${shop.slug}: active flag`, r?.active === true, String(r?.active))

      // no unapproved brackets or prizes were saved
      const [tiers, rewards, gifts] = await Promise.all([
        service.from('reward_tiers').select('id', { count: 'exact', head: true }).eq('store_id', r.id),
        service.from('rewards').select('id', { count: 'exact', head: true }).eq('store_id', r.id),
        service.from('tier_gift_options').select('id', { count: 'exact', head: true }).eq('store_id', r.id),
      ])
      check(
        `${shop.slug}: zero brackets and zero prizes saved (owner configures them)`,
        tiers.count === 0 && rewards.count === 0 && (gifts.count ?? 0) === 0,
        `tiers=${tiers.count} rewards=${rewards.count} gifts=${gifts.count ?? 0}`,
      )

      // subscription is live so the campaign gate passes once the owner sets up
      const { data: sub } = await service
        .from('store_subscriptions')
        .select('status, trial_ends_at')
        .eq('store_id', r.id)
        .limit(1)
      check(
        `${shop.slug}: subscription trial active`,
        sub?.[0]?.status === 'trial' && (!sub[0].trial_ends_at || sub[0].trial_ends_at >= new Date().toISOString().slice(0, 10)),
        JSON.stringify(sub ?? null),
      )

      // anon surface: the customer route can resolve this shop
      const anon = sessionClient()
      const { data: anonRows } = await anon
        .from('stores')
        .select('slug, name, status')
        .eq('slug', shop.slug)
        .eq('active', true)
      check(`${shop.slug}: anon customer surface resolves the shop`, anonRows?.length === 1, JSON.stringify(anonRows ?? null))
    }

    // ---- 5. neighbour isolation: no other tenant's row changed ----
    console.log('\n--- tenant isolation ---')
    const { data: afterRows } = await service
      .from('stores')
      .select('id, slug, name, subtitle, logo_url, google_review_url, status, active, min_spin_amount')
      .in('slug', NEIGHBOURS)
    for (const r of afterRows ?? []) {
      check(`${r.slug}: untouched by onboarding`, JSON.stringify(r) === beforeBySlug[r.slug], 'row changed')
    }
    }
  } finally {
    // ---- self-cleaning teardown ----
    const { error: delErr } = await service.auth.admin.deleteUser(tempUser.user.id)
    check('temporary platform administrator removed', !delErr, delErr?.message ?? '')
    const { data: adminsLeft } = await service
      .from('platform_admins')
      .select('user_id')
    check('no stray platform administrators remain', (adminsLeft ?? []).every((a) => a.user_id !== tempUser.user.id))
  }

  console.log(`\nRESULT ${pass} passed, ${fail} failed (onboard-clients ${TARGET_ENV})`)
  if (fail > 0) process.exit(1)
}

await main()
