// JRIQ v1.1.0 Phase 3 - slug-swap security suite. STAGING ONLY.
//
// Threat model: a URL slug is an ADDRESS, never an authorisation key. A crafted,
// swapped or reserved slug must never load another shop's data or act with
// another shop's privileges - at the UI (Phase 4) AND at raw-RPC/RLS level (here).
//
// Rows:
//   L1 reserved-slug wall: router half is pinned by src/lib/slugs.test.ts;
//      this proves the DB half (CHECK + create_shop) and the sync behaviour.
//   L2 cross-tenant raw-RPC denials: owner A's JWT against shop B's resources.
//   L3 anon walls: unauthenticated callers get nothing.
//   L4 platform RPCs return 42501-class denials to ordinary owners.
//   L5 suspended shops reject submissions backend-side.
//   L6 customer_path is root-level ('/{slug}') as of this release.
//   L7 an unknown address never resolves to a different shop.
//
// Synthetic data only: disposable users/shops with random emails and slugs;
// everything created by the run is deleted afterwards. Never point at production.
//
// Usage (PowerShell):
//   $keys = npx.cmd supabase projects api-keys --project-ref wpytaorgiqkfnifsuhax --output json | ConvertFrom-Json
//   $env:SUPABASE_STAGING_URL = 'https://wpytaorgiqkfnifsuhax.supabase.co'
//   $env:SUPABASE_STAGING_ANON_KEY = ($keys | Where-Object name -eq 'anon').api_key
//   $env:SUPABASE_STAGING_SERVICE_KEY = ($keys | Where-Object name -eq 'service_role').api_key
//   node scripts/staging-slug-swap.mjs
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_STAGING_URL
const ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_STAGING_SERVICE_KEY

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_STAGING_URL / _ANON_KEY / _SERVICE_KEY')
  process.exit(2)
}
if (!URL.includes('wpytaorgiqkfnifsuhax')) {
  console.error(`Refusing to run: ${URL} is not the verified staging project`)
  process.exit(2)
}

// Exact mirror of src/lib/slugs.ts (pinned there against the migration).
const RESERVED = [
  'admin', 'api', 'assets', 'auth', 'dashboard', 'login', 'platform', 'privacy',
  'standee', 'store', 'vendor',
  '.htaccess', '404.html', 'error_pages', 'favicon.ico', 'favicon.svg', 'icons.svg',
  'index.html', 'logo-placeholder.svg', 'logo.svg', 'manifest.json', 'robots.txt',
  'sitemap.xml',
]

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}
// supabase-js resolves with { error } instead of rejecting: assert on the result.
async function expectError(name, promise, needle, codeNeedle) {
  const { error } = await promise
  if (!error) {
    check(name, false, 'expected an error, got success')
    return
  }
  const messageOk = !needle || error.message.includes(needle)
  const codeOk = !codeNeedle || error.code === codeNeedle
  if (!messageOk || !codeOk) {
    check(name, false, `error was code=${error.code} message=${error.message}`)
  } else {
    check(name, true)
  }
}

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
const platform = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
const ownerA = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
const ownerB = createClient(URL, ANON_KEY, { auth: { persistSession: false } })

const run = Date.now().toString(36)
const passwords = {}
const createdUserIds = []
const createdStoreIds = []
async function makeUser(tag, email) {
  const password = `Swap-${run}-${tag}!x`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  createdUserIds.push(data.user.id)
  passwords[email] = password
  return data.user
}
const phoneSeq = () => `${'6789'[Math.floor(Math.random() * 4)]}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

async function main() {
  const adminEmail = `swap-admin-${run}@example.com`
  const aEmail = `swap-owner-a-${run}@example.com`
  const bEmail = `swap-owner-b-${run}@example.com`
  const wEmail = `swap-wall-${run}@example.com`
  const adminUser = await makeUser('admin', adminEmail)
  await makeUser('a', aEmail)
  await makeUser('b', bEmail)
  // Owner A/B each own EXACTLY ONE shop: workspace RPCs resolve the store from
  // store_admins (limit 1), so a second membership would change what "self" is.
  await makeUser('wall', wEmail)

  const { error: paErr } = await service.from('platform_admins').insert({ user_id: adminUser.id })
  check('L4 seed platform admin (service role)', !paErr, paErr?.message)

  for (const [client, email] of [[platform, adminEmail], [ownerA, aEmail], [ownerB, bEmail]]) {
    const { error } = await client.auth.signInWithPassword({ email, password: passwords[email] })
    check(`L4 sign in ${email.split('-').slice(0, 3).join('-')}`, !error, error?.message)
  }

  // =====================================================================
  // L1 - reserved-slug wall (database half)
  // =====================================================================
  for (const reserved of RESERVED) {
    await expectError(
      `L1 create_shop refuses reserved slug "${reserved}"`,
      platform.rpc('create_shop', {
        p_name: `Wall ${run}`, p_slug: reserved, p_owner_email: aEmail,
      }),
      reserved.match(/^[a-z0-9]+(-[a-z0-9]+)*$/) ? 'reserved' : 'Invalid shop slug',
    )
  }
  await expectError('L1 create_shop refuses uppercase slug', platform.rpc('create_shop', {
    p_name: `Wall ${run}`, p_slug: `Shop-${run}`, p_owner_email: aEmail,
  }), 'Invalid shop slug')
  await expectError('L1 create_shop refuses double-dash slug', platform.rpc('create_shop', {
    p_name: `Wall ${run}`, p_slug: `shop--${run}`, p_owner_email: aEmail,
  }), 'Invalid shop slug')

  const { data: wallShop, error: wallErr } = await platform.rpc('create_shop', {
    p_name: `Wall Control ${run}`, p_slug: `wall-control-${run}`, p_owner_email: wEmail,
  })
  check('L1 control: non-reserved slug creates fine', !wallErr && wallShop?.length === 1, wallErr?.message)
  if (wallShop?.[0]) createdStoreIds.push(wallShop[0].shop_id)
  check('L6 customer_path is root-level for the control shop',
    wallShop?.[0]?.customer_path === `/wall-control-${run}`, wallShop?.[0]?.customer_path)

  const { error: directErr } = await service.from('stores').insert({ slug: 'store', name: 'Wall Direct' })
  check('L1 direct insert of reserved slug hits stores_slug_reserved_check',
    !!directErr && directErr.message.includes('stores_slug_reserved_check'), directErr?.message ?? 'insert succeeded')

  // =====================================================================
  // Setup: two tenants, one real claim in shop B
  // =====================================================================
  const slugA = `jwellery-${run}`
  const slugB = `kalyan-${run}`
  const { data: shopAData, error: shopAErr } = await platform.rpc('create_shop', {
    p_name: `Swap Shop A ${run}`, p_slug: slugA, p_owner_email: aEmail,
  })
  check('setup create_shop A', !shopAErr && shopAData?.length === 1, shopAErr?.message)
  const shopA = shopAData?.[0]
  if (shopA) createdStoreIds.push(shopA.shop_id)
  check('L6 customer_path for shop A is "/{slug}"', shopA?.customer_path === `/${slugA}`, shopA?.customer_path)

  const { data: shopBData, error: shopBErr } = await platform.rpc('create_shop', {
    p_name: `Swap Shop B ${run}`, p_slug: slugB, p_owner_email: bEmail,
  })
  check('setup create_shop B', !shopBErr && shopBData?.length === 1, shopBErr?.message)
  const shopB = shopBData?.[0]
  if (shopB) createdStoreIds.push(shopB.shop_id)
  check('L6 customer_path for shop B is "/{slug}"', shopB?.customer_path === `/${slugB}`, shopB?.customer_path)

  // Platform activates both campaigns (real lifecycle: create -> onboarding ->
  // active). Owner workspace RPCs resolve through is_store_admin, which requires
  // an active campaign - the same gate production uses.
  for (const s of [shopA, shopB]) {
    const { error } = await platform.rpc('set_store_status', { p_store_id: s.shop_id, p_status: 'active' })
    check(`setup platform activates ${s.shop_slug}`, !error, error?.message)
  }

  // A real reward + tier binding in shop B, then one real engine submission.
  const { data: rewardB, error: rbErr } = await service.from('rewards').insert({
    store_id: shopB.shop_id,
    name: `Swap Gift ${run}`,
    wheel_label: 'SWAP',
    description: 'slug-swap suite fixture',
    claim_code_prefix: 'SWAP',
    validity_text: 'suite fixture',
    active: true,
  }).select().single()
  check('setup shop B reward', !rbErr && !!rewardB, rbErr?.message)

  const { data: tiersB } = await service.from('reward_tiers').select('*').eq('store_id', shopB.shop_id).order('min_amount')
  const bindRes = await ownerB.rpc('save_store_tiers', {
    p_tiers: (tiersB ?? []).map((t) => ({
      id: t.id, min_amount: t.min_amount, max_amount: t.max_amount,
      reward_id: rewardB.id, target_segment: t.target_segment, active: t.active,
    })),
  })
  check('setup owner B binds reward to own tiers', !bindRes.error, bindRes.error?.message)

  const { data: drawB, error: drawErr } = await anon.rpc('submit_customer_entry', {
    p_store_slug: slugB,
    p_request_id: randomUUID(),
    p_customer_name: 'Swap Customer B',
    p_customer_phone: phoneSeq(),
    p_purchase_amount: 15000,
  })
  check('setup engine produces a real claim in shop B', !drawErr && drawB?.length === 1, drawErr?.message)
  const subB = drawB?.[0]?.submission_id

  const { data: tiersA } = await service.from('reward_tiers').select('*').eq('store_id', shopA.shop_id).order('min_amount')
  const tierA = tiersA?.[0]
  const tierB = tiersB?.[0]

  // =====================================================================
  // L2 - cross-tenant raw-RPC denials (owner A vs shop B)
  // =====================================================================
  {
    const { data: isAdminB } = await ownerA.rpc('is_store_admin', { p_store_id: shopB.shop_id })
    check('L2 owner A is not admin of shop B (is_store_admin)', isAdminB === false, JSON.stringify(isAdminB))

    await expectError('L2 owner A cannot write shop B tiers (admin_save_store_tiers)', ownerA.rpc('admin_save_store_tiers', {
      p_store_id: shopB.shop_id, p_tiers: [],
    }), 'Platform access is required')
    await expectError('L2 owner A cannot set shop B status', ownerA.rpc('set_store_status', {
      p_store_id: shopB.shop_id, p_status: 'suspended',
    }), 'Platform access is required')
    await expectError('L2 owner A cannot re-link shop B owner', ownerA.rpc('link_store_owner', {
      p_store_id: shopB.shop_id, p_email: aEmail,
    }), 'Platform access is required')
    await expectError('L2 owner A cannot open shop B gift pool', ownerA.rpc('save_store_gift_options', {
      p_tier_id: tierB.id, p_catalog_gift_ids: [],
    }), 'Store workspace access is not active')
    await expectError('L2 owner A cannot collect shop B claim', ownerA.rpc('mark_submission_collected', {
      p_submission_id: subB,
    }), 'Customer record not found')

    const { data: subRows } = await ownerA.from('submissions').select('id').eq('store_id', shopB.shop_id)
    check('L2 owner A RLS read of shop B submissions returns 0 rows', !subRows || subRows.length === 0)
    const { data: admRows } = await ownerA.from('store_admins').select('user_id').eq('store_id', shopB.shop_id)
    check('L2 owner A RLS read of shop B store_admins returns 0 rows', !admRows || admRows.length === 0)
    const { data: poolRows } = await ownerA.from('tier_gift_options').select('tier_id').eq('store_id', shopB.shop_id)
    check('L2 owner A RLS read of shop B gift pools returns 0 rows', !poolRows || poolRows.length === 0)

    await expectError('L2 owner B cannot rewrite shop A tiers via legacy RPC', ownerB.rpc('save_store_tiers', {
      p_tiers: [{
        id: tierA.id, min_amount: 1000, max_amount: null, reward_id: rewardB.id,
        target_segment: 0, active: true,
      }],
    }), 'belongs to another store')

    // Positive control: the self-scoped RPC resolves the store from the AUTH
    // CONTEXT (store_admins) - there is no slug or store parameter to swap.
    // Shop A gets its own gift; owner A binds it to shop A's tiers only.
    const { data: rewardA, error: raErr } = await service.from('rewards').insert({
      store_id: shopA.shop_id,
      name: `Swap Gift A ${run}`,
      wheel_label: 'SWAPA',
      description: 'slug-swap suite fixture A',
      claim_code_prefix: 'SWPA',
      validity_text: 'suite fixture',
      active: true,
    }).select().single()
    check('L2 positive control fixture: shop A gift created', !raErr && !!rewardA, raErr?.message)

    const { data: tiersBFresh } = await service.from('reward_tiers').select('*').eq('store_id', shopB.shop_id).order('min_amount')
    const beforeB = JSON.stringify((tiersBFresh ?? []).map((t) => [t.id, t.reward_id]))
    const { data: tiersA2 } = await service.from('reward_tiers').select('*').eq('store_id', shopA.shop_id).order('min_amount')
    const selfRes = await ownerA.rpc('save_store_tiers', {
      p_tiers: (tiersA2 ?? []).map((t) => ({
        id: t.id, min_amount: t.min_amount, max_amount: t.max_amount,
        reward_id: rewardA.id, target_segment: t.target_segment, active: t.active,
      })),
    })
    check('L2 positive control: owner A self-scoped RPC succeeds', !selfRes.error, selfRes.error?.message)
    const { data: tiersAAfter } = await service.from('reward_tiers').select('*').eq('store_id', shopA.shop_id).order('min_amount')
    check('L2 positive control: owner A wrote shop A tiers (bound to own gift)',
      !!tiersAAfter && tiersAAfter.every((t) => t.reward_id === rewardA.id))
    const { data: tiersBAfter } = await service.from('reward_tiers').select('*').eq('store_id', shopB.shop_id).order('min_amount')
    check('L2 positive control: shop B tiers untouched by owner A call',
      JSON.stringify((tiersBAfter ?? []).map((t) => [t.id, t.reward_id])) === beforeB)
  }

  // =====================================================================
  // L3 - anon walls
  // =====================================================================
  {
    await expectError('L3 anon cannot call is_store_admin', anon.rpc('is_store_admin', {
      p_store_id: shopB.shop_id,
    }), null, '42501')
    await expectError('L3 anon cannot call admin_save_store_tiers', anon.rpc('admin_save_store_tiers', {
      p_store_id: shopA.shop_id, p_tiers: [],
    }))
    await expectError('L3 anon cannot call set_store_status', anon.rpc('set_store_status', {
      p_store_id: shopB.shop_id, p_status: 'suspended',
    }))
    await expectError('L3 anon cannot call link_store_owner', anon.rpc('link_store_owner', {
      p_store_id: shopB.shop_id, p_email: bEmail,
    }))
    await expectError('L3 anon cannot call save_store_gift_options', anon.rpc('save_store_gift_options', {
      p_tier_id: tierA.id, p_catalog_gift_ids: [],
    }))
    await expectError('L3 anon cannot call save_store_tiers', anon.rpc('save_store_tiers', {
      p_tiers: [],
    }))
    await expectError('L3 anon cannot call mark_submission_collected', anon.rpc('mark_submission_collected', {
      p_submission_id: subB,
    }))
    await expectError('L3 anon cannot call create_shop', anon.rpc('create_shop', {
      p_name: `Anon Shop ${run}`, p_slug: `anon-shop-${run}`, p_owner_email: aEmail,
    }), null, '42501')

    const { data: anonSubs } = await anon.from('submissions').select('id')
    check('L3 anon RLS read of submissions returns 0 rows', !anonSubs || anonSubs.length === 0)
    const { data: anonAdms } = await anon.from('store_admins').select('user_id')
    check('L3 anon RLS read of store_admins returns 0 rows', !anonAdms || anonAdms.length === 0)
    const { data: anonPools } = await anon.from('tier_gift_options').select('tier_id')
    check('L3 anon RLS read of gift pools returns 0 rows', !anonPools || anonPools.length === 0)
    const { error: anonUpd } = await anon.from('submissions').update({ reward_label: 'hacked' }).eq('id', subB)
    check('L3 anon cannot modify a claim record', !!anonUpd, 'update succeeded')
  }

  // =====================================================================
  // L4 - platform surface rejects ordinary owners (42501-class)
  // =====================================================================
  await expectError('L4 owner A cannot call create_shop', ownerA.rpc('create_shop', {
    p_name: `Hax ${run}`, p_slug: `hax-${run}`, p_owner_email: aEmail,
  }), 'Platform access is required')

  // =====================================================================
  // L5 + L7 - suspended blocks submissions; unknown address resolves to nothing
  // =====================================================================
  {
    await platform.rpc('set_store_status', { p_store_id: shopB.shop_id, p_status: 'suspended' })
    const { error } = await anon.rpc('submit_customer_entry', {
      p_store_slug: slugB,
      p_request_id: randomUUID(),
      p_customer_name: 'Blocked Customer',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 15000,
    })
    check('L5 suspended shop rejects new submissions backend-side', !!error && error.message.includes('Campaign is unavailable'), error?.message)
    const { data: activeB } = await ownerB.rpc('is_store_campaign_active', { p_store_id: shopB.shop_id })
    check('L5 owner B sees campaign inactive while suspended', activeB === false, JSON.stringify(activeB))
    await platform.rpc('set_store_status', { p_store_id: shopB.shop_id, p_status: 'active' })
    const { data: activeB2 } = await ownerB.rpc('is_store_campaign_active', { p_store_id: shopB.shop_id })
    check('L5 campaign active again after restore', activeB2 === true, JSON.stringify(activeB2))

    const { error: unknownErr } = await anon.rpc('submit_customer_entry', {
      p_store_slug: `no-such-shop-${run}`,
      p_request_id: randomUUID(),
      p_customer_name: 'Lost Customer',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 15000,
    })
    check('L7 unknown address never resolves to a shop', !!unknownErr && unknownErr.message.includes('Campaign is unavailable'), unknownErr?.message)
  }
}

async function cleanup() {
  // Remove the run's synthetic tenant data first (dependency order), then users.
  for (const id of createdStoreIds) {
    await service.from('tier_gift_options').delete().eq('store_id', id)
    await service.from('submissions').delete().eq('store_id', id)
    await service.from('reward_tiers').delete().eq('store_id', id)
    await service.from('rewards').delete().eq('store_id', id)
    await service.from('public_submission_rate_limits').delete().eq('store_id', id)
    await service.from('platform_audit_logs').delete().eq('store_id', id)
    await service.from('store_owner_invitations').delete().eq('store_id', id)
    await service.from('store_subscriptions').delete().eq('store_id', id)
    await service.from('store_admins').delete().eq('store_id', id)
    await service.from('stores').delete().eq('id', id)
  }
  await service.from('platform_admins').delete().in('user_id', createdUserIds)
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id)
  }
}

main()
  .catch((err) => {
    fail += 1
    console.error(`FAIL  suite crashed -- ${err?.message ?? err}`)
  })
  .finally(async () => {
    await cleanup()
    console.log(`\nRESULT ${pass} passed, ${fail} failed (slug-swap suite, staging)`)
    process.exit(fail > 0 ? 1 : 0)
  })
