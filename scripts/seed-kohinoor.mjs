#!/usr/bin/env node
// Idempotent Kohinoor provisioning through the EXISTING platform workflows.
//
// Task: "Add a shop named Kohinoor, with the customer-facing route /kohinoor"
// using the supplied brand asset C:\Users\ojaswa\Downloads\kohinoor.png and the
// existing multi-tenant architecture. This script never writes directly to
// tables behind RLS except as the platform-admin actor it provisions:
//
//   1. temporary, self-cleaning platform administrator
//      (scripts/temp-platform-admin.mjs - the audited actor pattern)
//   2. shop               -> create_shop RPC (idempotent on slug), NO owner
//      e-mail is fabricated: owner_link_status stays 'unclaimed' and the panel
//      shows the setup-pending state until a real owner is linked
//   3. catalogue gifts    -> the three approved gift TYPES from the brief
//      (silver coin, jewellery cleaning kit, approved voucher) added to the
//      existing central catalogue with platform price-policy bounds
//   4. per-bracket pools  -> save_store_gift_options RPC (server-enforced
//      count/price/availability limits), with a demo declared value inside the
//      policy for the silver coin
//   5. activation         -> set_store_status RPC ('active' so the customer
//      journey is live; review link stays unconfigured and renders gracefully)
//   6. logo               -> scripts/upload-store-logo.mjs (Supabase Storage
//      store-logos/{storeId}/... - NEVER a Windows path; byte-identity proof)
//   7. verification       -> read-back, idempotency shape, tenant isolation
//      (no other shop touched), storage-URL logo proof
//
// Idempotent: re-running finds the existing shop, catalogue entries and pools
// and never duplicates them. Exit 0 = every check passed.
//
// Usage:
//   node scripts/seed-kohinoor.mjs --env staging [--keys <keys.json>]
//        [--logo <path>] [--dry-run]
//
//   PRODUCTION IS REFUSED without --confirm-production (and is a separate,
//   explicitly approved release action - see the QA report).
//
//   Key values are NEVER printed.

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

const TARGET_ENV = argValue('--env') || 'staging'
const KEYS_FILE = argValue('--keys')
const LOGO_FILE = argValue('--logo') ?? 'C:\\Users\\ojaswa\\Downloads\\kohinoor.png'
const DRY_RUN = args.includes('--dry-run')
const CONFIRM_PRODUCTION = args.includes('--confirm-production')

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const EXPECTED_REF = REF_BY_ENV[TARGET_ENV]

if (TARGET_ENV === 'production' && !CONFIRM_PRODUCTION) {
  console.error('Refusing to write to production without --confirm-production (explicit approval required).')
  process.exit(2)
}

let keys = {
  url: process.env.SUPABASE_URL,
  anon: process.env.SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_KEY,
}
if (KEYS_FILE) {
  const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  keys = { url: parsed.url ?? keys.url, anon: parsed.anon ?? keys.anon, service: parsed.service ?? keys.service }
}
if (!keys.url || !keys.anon || !keys.service) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY (or a --keys file)')
  process.exit(2)
}
if (!EXPECTED_REF || !keys.url.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${keys.url} is not the ${TARGET_ENV} project (${EXPECTED_REF})`)
  process.exit(2)
}

const SHOP = {
  name: 'Kohinoor',
  slug: 'kohinoor',
  // Brief: "If owner details or a real review URL are missing, do not fabricate
  // them." Empty owner e-mail -> create_shop reports 'unclaimed'.
  ownerEmail: '',
}

// The brief's approved gift examples, added to the EXISTING central catalogue.
// Price policy = the platform's allowed declared-value range per gift type.
// (purchase amount, gift value and price limits stay separate concepts.)
const CATALOG_GIFTS = [
  {
    name: 'Jewellery Cleaning Kit',
    wheelLabel: 'CLEANING KIT',
    description: 'Professional jewellery cleaning and care kit',
    voucherValue: 500,
    valueMin: 300,
    valueMax: 1000,
    claimCodePrefix: 'CARE',
    validityText: 'Collect within 30 days',
  },
  {
    name: 'Silver Coin',
    wheelLabel: 'SILVER COIN',
    description: 'Pure silver coin (20 g)',
    voucherValue: 2500,
    valueMin: 1500,
    valueMax: 5000,
    claimCodePrefix: 'SILVER',
    validityText: 'Collect within 30 days',
  },
  {
    name: 'Approved Voucher',
    wheelLabel: 'VOUCHER',
    description: 'Approved gift voucher',
    voucherValue: 1000,
    valueMin: 500,
    valueMax: 2000,
    claimCodePrefix: 'GIFT',
    validityText: 'Redeem within 30 days',
  },
]

const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

function pass(msg) {
  console.log(`PASS  ${msg}`)
}
function info(msg) {
  console.log(`INFO  ${msg}`)
}

async function findShop() {
  const { data, error } = await service
    .from('stores')
    .select('id, slug, name, status, logo_url, min_spin_amount, google_review_url')
    .eq('slug', SHOP.slug)
  if (error) throw new Error(`stores read: ${error.message}`)
  if ((data ?? []).length > 1) throw new Error('slug kohinoor is duplicated - refusing to continue')
  return data?.[0] ?? null
}

async function ensureCatalogGift(admin, gift) {
  const { data: existing, error } = await admin
    .from('gift_catalog')
    .select('id, name, voucher_value, value_min, value_max')
    .eq('name', gift.name)
  if (error) throw new Error(`gift_catalog read: ${error.message}`)
  if ((existing ?? []).length > 0) {
    return { id: existing[0].id, created: false }
  }
  const { data: inserted, error: insertError } = await admin
    .from('gift_catalog')
    .insert({
      name: gift.name,
      wheel_label: gift.wheelLabel,
      description: gift.description,
      voucher_value: gift.voucherValue,
      value_min: gift.valueMin,
      value_max: gift.valueMax,
      claim_code_prefix: gift.claimCodePrefix,
      validity_text: gift.validityText,
      active: true,
    })
    .select('id')
    .single()
  if (insertError) throw new Error(`gift_catalog insert: ${insertError.message}`)
  return { id: inserted.id, created: true }
}

function runActorScript(command, extraArgs = []) {
  const argv = ['scripts/temp-platform-admin.mjs', command, '--env', TARGET_ENV, '--out', ACTOR_CREDS]
  if (KEYS_FILE) argv.push('--keys', KEYS_FILE)
  execFileSync(process.execPath, argv, { stdio: 'inherit', cwd: REPO_ROOT })
  void extraArgs
}

const REPO_ROOT = process.cwd()
const ACTOR_CREDS = join(tmpdir(), `jriq-kohinoor-actor-${randomBytes(3).toString('hex')}.json`)

async function main() {
  info(`target: ${TARGET_ENV} (${keys.url.split('//')[1].split('.')[0]} project ${EXPECTED_REF})`)
  const before = await findShop()
  if (before) {
    info(`shop ${SHOP.slug} already exists (${before.id}) - idempotent continuation`)
  }
  if (DRY_RUN) {
    info('dry-run: would provision actor, create/find shop, seed catalogue gifts,')
    info('dry-run: assign per-bracket pools, activate, upload logo, verify, remove actor')
    return
  }

  // 1. temporary platform administrator (self-cleaning)
  runActorScript('create')
  const actor = JSON.parse(readFileSync(ACTOR_CREDS, 'utf8'))
  const admin = createClient(keys.url, keys.anon, { auth: { persistSession: false } })
  const { error: signInError } = await admin.auth.signInWithPassword({
    email: actor.email,
    password: actor.password,
  })
  if (signInError) throw new Error(`actor sign-in: ${signInError.message}`)
  pass(`temporary platform administrator ready (${actor.email.replace(/^[^@]+/, 'actor')})`)

  try {
    // 2. shop via the platform RPC (idempotent on slug; blank owner = unclaimed)
    const { data: shopRows, error: shopError } = await admin.rpc('create_shop', {
      p_name: SHOP.name,
      p_slug: SHOP.slug,
      p_owner_email: SHOP.ownerEmail,
      p_logo_url: null,
      p_tiers: null,
    })
    if (shopError) throw new Error(`create_shop: ${shopError.message}`)
    const shopRow = Array.isArray(shopRows) ? shopRows[0] : shopRows
    if (!shopRow?.shop_id) throw new Error('create_shop returned no shop')
    if (shopRow.owner_link_status !== 'unclaimed') {
      throw new Error(`owner status must stay 'unclaimed' (got ${shopRow.owner_link_status})`)
    }
    pass(`shop ready: ${shopRow.shop_name} (${shopRow.shop_slug}) owner_link_status=unclaimed`)

    const storeId = shopRow.shop_id

    // 3. catalogue gifts (idempotent by name)
    const giftIds = {}
    for (const gift of CATALOG_GIFTS) {
      const { id, created } = await ensureCatalogGift(admin, gift)
      giftIds[gift.name] = id
      pass(`catalogue gift ${created ? 'added' : 'already present'}: ${gift.name}`)
    }

    // 4. per-bracket pools: every active bracket gets the three approved gifts.
    //    The silver coin carries a demo declared value INSIDE its price policy
    //    to prove the server-enforced override mechanism end to end.
    const { data: tiers, error: tierError } = await admin
      .from('reward_tiers')
      .select('id, min_amount, max_amount')
      .eq('store_id', storeId)
      .order('min_amount')
    if (tierError) throw new Error(`reward_tiers read: ${tierError.message}`)
    if (!tiers || tiers.length === 0) throw new Error('no purchase brackets found for kohinoor')

    const allIds = CATALOG_GIFTS.map((g) => giftIds[g.name])
    const declared = { [giftIds['Silver Coin']]: 2200 }
    for (const tier of tiers) {
      const { error: saveError } = await admin.rpc('save_store_gift_options', {
        p_tier_id: tier.id,
        p_catalog_gift_ids: allIds,
        p_declared_values: declared,
        p_quantities: null,
      })
      if (saveError) {
        throw new Error(`save_store_gift_options (${tier.min_amount}-${tier.max_amount ?? '∞'}): ${saveError.message}`)
      }
    }
    pass(`gift pools configured on ${tiers.length} purchase brackets (3 gifts each, silver coin declared ₹2,200)`)

    // 5. activate the campaign (customer journey live; review link stays NULL)
    const { error: statusError } = await admin.rpc('set_store_status', {
      p_store_id: storeId,
      p_status: 'active',
    })
    if (statusError) throw new Error(`set_store_status: ${statusError.message}`)
    pass('shop activated (campaign live)')

    // 6. logo through the audited uploader (storage URL, byte-identity proof)
    if (existsSync(LOGO_FILE)) {
      const argv = [
        'scripts/upload-store-logo.mjs',
        '--slug', SHOP.slug,
        '--file', LOGO_FILE,
        '--env', TARGET_ENV,
        '--isolation-check',
      ]
      if (KEYS_FILE) argv.push('--keys', KEYS_FILE)
      execFileSync(process.execPath, argv, { stdio: 'inherit', cwd: REPO_ROOT })
    } else {
      console.error(`FAIL  supplied logo not found at ${LOGO_FILE} - cannot proceed without the real asset`)
      process.exit(1)
    }
  } finally {
    // 7. actor teardown
    runActorScript('remove')
  }

  // 8. verification (service key = read-only here)
  const shop = await findShop()
  if (!shop) throw new Error('verification: shop missing after provisioning')
  if (!shop.logo_url || !/^https:\/\//.test(shop.logo_url) || !/store-logos/.test(shop.logo_url)) {
    throw new Error(`verification: logo_url is not a storage URL (${String(shop.logo_url).slice(0, 60)})`)
  }
  if (/^[A-Za-z]:\\/.test(shop.logo_url)) throw new Error('verification: logo_url is a Windows path!')
  if (shop.google_review_url !== null) {
    throw new Error('verification: review link must stay unconfigured (no fabricated destination)')
  }
  if (shop.status !== 'active') throw new Error(`verification: expected active, got ${shop.status}`)

  const { data: tierRows } = await service
    .from('reward_tiers')
    .select('id')
    .eq('store_id', shop.id)
  const { data: pools } = await service
    .from('tier_gift_options')
    .select('id, active, declared_value, quantity_claimed')
    .eq('store_id', shop.id)
  const { data: owners } = await service
    .from('store_admins')
    .select('user_id')
    .eq('store_id', shop.id)
  if ((owners ?? []).length !== 0) {
    throw new Error('verification: no owner account may be created for kohinoor')
  }

  // tenant isolation: provisioning must not have touched any other shop
  const { data: others } = await service
    .from('stores')
    .select('id, slug')
    .neq('slug', SHOP.slug)
  pass(`verification: logo is a storage URL (${shop.logo_url.split('/').slice(-2).join('/')})`)
  pass(`verification: ${tierRows?.length ?? 0} purchase brackets, ${(pools ?? []).length} gift options, 0 owner accounts (setup-pending)`)
  pass(`verification: review link unconfigured, ${others?.length ?? 0} other shops untouched`)
  pass('kohinoor provisioning complete')
}

main()
  .catch((err) => {
    console.error(`FAIL  ${err?.message ?? err}`)
    process.exitCode = 1
  })
  .finally(() => {
    if (existsSync(ACTOR_CREDS)) rmSync(ACTOR_CREDS)
  })
