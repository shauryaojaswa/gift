// Staging integration checks for JRIQ multi-tenant + reward-engine behaviour.
// Runs ONLY against the verified staging project (ref is asserted below).
// Synthetic data only: disposable users/shops with random emails and slugs;
// auth users, shops and catalogue rows created by the run are deleted afterwards.
// Never point this at production.
//
// Usage (PowerShell):
//   $keys = npx.cmd supabase projects api-keys --project-ref wpytaorgiqkfnifsuhax --output json | ConvertFrom-Json
//   $env:SUPABASE_STAGING_URL = 'https://wpytaorgiqkfnifsuhax.supabase.co'
//   $env:SUPABASE_STAGING_ANON_KEY = ($keys | Where-Object name -eq 'anon').api_key
//   $env:SUPABASE_STAGING_SERVICE_KEY = ($keys | Where-Object name -eq 'service_role').api_key
//   node scripts/staging-verify.mjs
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

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
// supabase-js resolves with { error } instead of rejecting: assert on the result.
async function expectError(name, promise, needle) {
  const { error } = await promise
  if (!error) {
    check(name, false, 'expected an error, got success')
  } else if (needle && !error.message.includes(needle)) {
    check(name, false, `error was: ${error.message}`)
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
const createdGiftIds = []
async function makeUser(tag, email) {
  const password = `Staging-${run}-${tag}!x`
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  createdUserIds.push(data.user.id)
  passwords[email] = password
  return data.user
}
const phoneSeq = () => `${'6789'[Math.floor(Math.random() * 4)]}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

async function main() {
  // ---- synthetic users ----
  const adminEmail = `platform-admin-${run}@example.com`
  const aEmail = `owner-a-${run}@example.com`
  const bEmail = `owner-b-${run}@example.com`
  const lateEmail = `owner-late-${run}@example.com`
  const adminUser = await makeUser('admin', adminEmail)
  const aUser = await makeUser('a', aEmail)
  await makeUser('b', bEmail)

  const { error: paErr } = await service.from('platform_admins').insert({ user_id: adminUser.id })
  check('seed platform admin (service role)', !paErr, paErr?.message)

  for (const [client, email] of [[platform, adminEmail], [ownerA, aEmail], [ownerB, bEmail]]) {
    const { error } = await client.auth.signInWithPassword({ email, password: passwords[email] })
    check(`sign in ${email.split('-').slice(0, 2).join('-')}`, !error, error?.message)
  }

  // ---- public/anon surface restrictions ----
  {
    const { data } = await anon.from('tier_gift_options').select('*')
    check('anon cannot read tier gift pools', !data || data.length === 0)
    const { data: polRows, error: polErr } = await anon.from('platform_policies').select('*')
    check('anon cannot read platform policies', !!polErr || !polRows || polRows.length === 0, 'rows visible')
    const { data: invRows, error: invErr } = await anon.from('store_owner_invitations').select('*')
    check('anon cannot read owner invitations', !!invErr || !invRows || invRows.length === 0, 'rows visible')
    const { error: upErr } = await anon.from('submissions').update({ reward_label: 'hacked' }).eq('id', randomUUID())
    check('anon cannot modify submissions', !!upErr, 'update succeeded')
    const { error: catErr } = await anon.from('gift_catalog').insert({ name: 'Evil Gift', wheel_label: 'EVIL' })
    check('anon cannot insert catalogue gifts', !!catErr, 'insert succeeded')
  }

  // ---- platform surface rejects ordinary owners ----
  {
    await expectError('owner cannot call create_shop', ownerA.rpc('create_shop', {
      p_name: 'Hax Shop', p_slug: `hax-${run}`, p_owner_email: aEmail,
    }), 'Platform access is required')
    await expectError('owner cannot call set_store_status', ownerA.rpc('set_store_status', {
      p_store_id: randomUUID(), p_status: 'active',
    }), 'Platform access is required')
    await expectError('owner cannot call admin_save_store_tiers', ownerA.rpc('admin_save_store_tiers', {
      p_store_id: randomUUID(), p_tiers: [],
    }), 'Platform access is required')
    await expectError('owner cannot call link_store_owner', ownerA.rpc('link_store_owner', {
      p_store_id: randomUUID(), p_email: aEmail,
    }), 'Platform access is required')
    const { error: escErr } = await ownerA.from('platform_admins').insert({ user_id: aUser.id })
    check('owner cannot self-escalate to platform admin', !!escErr, 'insert succeeded')
  }

  // ---- create shops ----
  const slugA = `shop-a-${run}`
  const slugB = `shop-b-${run}`
  const slugC = `shop-c-${run}`
  const { data: shopAData, error: shopAErr } = await platform.rpc('create_shop', {
    p_name: `Synthetic Shop A ${run}`, p_slug: slugA, p_owner_email: aEmail,
  })
  check('create_shop A', !shopAErr && shopAData?.length === 1, shopAErr?.message)
  const shopA = shopAData?.[0]
  if (shopA) createdStoreIds.push(shopA.shop_id)

  const { data: shopAgain } = await platform.rpc('create_shop', {
    p_name: `Synthetic Shop A ${run}`, p_slug: slugA, p_owner_email: aEmail,
  })
  check('create_shop is idempotent on identical retry', shopAgain?.[0]?.shop_id === shopA?.shop_id)

  await expectError('create_shop rejects slug reuse with different name', platform.rpc('create_shop', {
    p_name: `Different Name ${run}`, p_slug: slugA, p_owner_email: aEmail,
  }), 'URL slug already in use')

  const { data: shopBData, error: shopBErr } = await platform.rpc('create_shop', {
    p_name: `Synthetic Shop B ${run}`, p_slug: slugB, p_owner_email: bEmail,
  })
  check('create_shop B', !shopBErr && shopBData?.length === 1, shopBErr?.message)
  const shopB = shopBData?.[0]
  if (shopB) createdStoreIds.push(shopB.shop_id)

  const { data: shopCData, error: shopCErr } = await platform.rpc('create_shop', {
    p_name: `Synthetic Shop C ${run}`, p_slug: slugC, p_owner_email: lateEmail,
  })
  const shopC = shopCData?.[0]
  if (shopC) createdStoreIds.push(shopC.shop_id)
  check('create_shop C (unregistered owner) -> pending', !shopCErr && shopC?.owner_link_status === 'pending', shopCErr?.message)

  // ---- default bracket template ----
  {
    const { data: tiers } = await platform.from('reward_tiers').select('*').eq('store_id', shopA.shop_id).order('min_amount')
    check('template creates 11 brackets', tiers?.length === 11, `got ${tiers?.length}`)
    let contiguous = (tiers?.length ?? 0) === 11
    for (let i = 1; i < (tiers?.length ?? 0); i += 1) {
      if (tiers[i - 1].max_amount !== tiers[i].min_amount) contiguous = false
    }
    check('template brackets are contiguous (no gaps/overlaps)', contiguous)
    check('template lowest bracket starts at 1000', tiers?.[0]?.min_amount === 1000)
    check('template top bracket is open-ended', tiers?.[tiers.length - 1]?.max_amount === null)
    const { data: storeRow } = await platform.from('stores').select('min_spin_amount, status').eq('id', shopA.shop_id).single()
    check('new shop min_spin_amount = 1000', storeRow?.min_spin_amount === 1000)
    const { data: cRow } = await platform.from('stores').select('status').eq('id', shopC.shop_id).single()
    check('new shop starts as onboarding (public flow closed)', cRow?.status === 'onboarding')
  }

  // ---- owner invitation / linking ----
  {
    await makeUser('late', lateEmail)
    const { data: linkStatus, error: linkErr } = await platform.rpc('link_store_owner', {
      p_store_id: shopC.shop_id, p_email: lateEmail,
    })
    check('link_store_owner links late-registered owner', !linkErr && linkStatus === 'linked', linkErr?.message)
    const { data: membership } = await platform.from('store_admins').select('*').eq('store_id', shopC.shop_id)
    check('linked owner has store_admins row', membership?.length === 1)
  }

  // ---- catalogue ----
  const giftNames = ['Care Kit', 'Silver Coin', 'Gold Voucher']
  const giftIds = createdGiftIds
  for (const name of giftNames) {
    const { data, error } = await platform.from('gift_catalog').insert({
      name: `${name} ${run}`,
      wheel_label: name.toUpperCase().slice(0, 12),
      description: `${name} synthetic gift`,
      voucher_value: 500,
      claim_code_prefix: 'GIFT',
      active: true,
    }).select().single()
    check(`platform admin creates catalogue gift ${name}`, !error, error?.message)
    if (data) giftIds.push(data.id)
  }
  {
    const { error } = await ownerA.from('gift_catalog').insert({ name: 'Sneaky Gift', wheel_label: 'SNEAKY' })
    check('shop owner cannot insert catalogue gifts', !!error, 'insert succeeded')
    const { data: updRows } = await ownerA.from('gift_catalog').update({ name: 'Sneaky' }).eq('id', giftIds[0]).select()
    check('shop owner cannot edit catalogue gifts', !updRows || updRows.length === 0, 'row updated')
    const { data: visible } = await ownerA.from('gift_catalog').select('id')
    check('shop owner can read active catalogue', (visible?.length ?? 0) >= 3)
  }

  // ---- gift selection: onboarding semantics, limits, eligibility, cross-tenant ----
  const { data: aTiers } = await platform.from('reward_tiers').select('*').eq('store_id', shopA.shop_id).order('min_amount')
  if (!aTiers || aTiers.length !== 11) {
    check('shop A has 11 brackets', false, `got ${aTiers?.length ?? 'none'}`)
  }
  const tierA2 = aTiers[1] // bracket [10000, 20000)
  {
    // During onboarding the platform admin can configure; the owner cannot
    // (is_store_admin requires an active campaign).
    const { error: onbErr } = await platform.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: [giftIds[0]],
    })
    check('platform admin configures pool during onboarding', !onbErr, onbErr?.message)
    await expectError('owner cannot configure during onboarding', ownerA.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: [giftIds[0]],
    }), 'Store workspace access is not active')
    // Scope to shop A: tiers of ACTIVE stores are public by design (the customer
    // wheel renders them), including other synthetic shops left by earlier runs.
    const { data: ownerView } = await ownerA
      .from('reward_tiers')
      .select('id')
      .eq('store_id', shopA.shop_id)
    check(
      'owner sees no tiers while shop is onboarding',
      !ownerView || ownerView.length === 0,
      `got ${ownerView?.length ?? 0}`,
    )
  }

  // ---- activate shops ----
  for (const s of [shopA, shopB, shopC]) {
    const { error } = await platform.rpc('set_store_status', { p_store_id: s.shop_id, p_status: 'active' })
    check(`activate ${s.shop_slug}`, !error, error?.message)
  }

  {
    const { error: optErr } = await ownerA.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: giftIds,
    })
    check('owner selects 3 catalogue gifts for a bracket', !optErr, optErr?.message)
    const { data: pool } = await service.from('tier_gift_options').select('*').eq('tier_id', tierA2.id)
    check('pool rows materialized (3)', pool?.length === 3, `got ${pool?.length}`)

    const { data: extra } = await platform.from('gift_catalog').insert({
      name: `Extra ${run}`, wheel_label: 'EXTRA', active: true,
    }).select().single()
    const { data: inactive } = await platform.from('gift_catalog').insert({
      name: `Inactive ${run}`, wheel_label: 'INACTIVE', active: false,
    }).select().single()

    await expectError('5th selection rejected (max 4 per bracket)', ownerA.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: [...giftIds, extra.id, inactive.id],
    }), 'at most')
    await expectError('inactive gift rejected', ownerA.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: [inactive.id],
    }), 'inactive or unknown')
    await expectError('duplicate gift in one bracket rejected', ownerA.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: [giftIds[0], giftIds[0]],
    }), 'Duplicate')
    await expectError('owner B cannot configure owner A bracket', ownerB.rpc('save_store_gift_options', {
      p_tier_id: tierA2.id, p_catalog_gift_ids: [giftIds[0]],
    }), 'Store workspace access is not active')
  }

  // ---- engine: assignment + idempotency ----
  let firstSubmission = null
  {
    const requestId = randomUUID()
    const { data, error } = await anon.rpc('submit_customer_entry', {
      p_store_slug: slugA,
      p_request_id: requestId,
      p_customer_name: 'Test Customer',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 15000,
    })
    check('anon submission assigns a pool gift', !error && data?.length === 1, error?.message)
    firstSubmission = data?.[0]
    const { data: inPool } = await service.from('tier_gift_options')
      .select('id').eq('tier_id', tierA2.id).eq('reward_id', firstSubmission?.reward?.id)
    check('assigned reward comes from the configured pool', (inPool?.length ?? 0) === 1, JSON.stringify(firstSubmission?.reward))

    await expectError('conflicting reuse of request id is rejected', anon.rpc('submit_customer_entry', {
      p_store_slug: slugA,
      p_request_id: requestId,
      p_customer_name: 'Different Name',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 15000,
    }), 'already been used')
  }

  {
    const requestId = randomUUID()
    const payload = {
      p_store_slug: slugA, p_request_id: requestId, p_customer_name: 'Same Payload',
      p_customer_phone: phoneSeq(), p_purchase_amount: 15000,
    }
    const first = await anon.rpc('submit_customer_entry', payload)
    const second = await anon.rpc('submit_customer_entry', payload)
    const a = first.data?.[0]
    const b = second.data?.[0]
    check('identical retry returns the same claim code',
      !first.error && !second.error && a?.claim_code === b?.claim_code && a?.submission_id === b?.submission_id,
      first.error?.message ?? second.error?.message)
    check('claim code uses the persisted prefix format', /^[A-Z0-9]+-[0-9A-F]{8}$/.test(a?.claim_code ?? ''), a?.claim_code)
  }

  {
    // Public rate limit: 5 submissions per hour per (store, phone digest); the
    // sixth must be rejected (the phone digest is scoped to this run's shop).
    const rlPhone = phoneSeq()
    let fiveOk = true
    for (let i = 0; i < 5; i += 1) {
      const { error } = await anon.rpc('submit_customer_entry', {
        p_store_slug: slugA,
        p_request_id: randomUUID(),
        p_customer_name: 'Rate Limit',
        p_customer_phone: rlPhone,
        p_purchase_amount: 15000,
      })
      if (error) fiveOk = false
    }
    check('rate limit allows five submissions per phone per hour', fiveOk)
    await expectError('rate limit rejects the sixth submission for one phone', anon.rpc('submit_customer_entry', {
      p_store_slug: slugA,
      p_request_id: randomUUID(),
      p_customer_name: 'Rate Limit',
      p_customer_phone: rlPhone,
      p_purchase_amount: 15000,
    }), 'Too many entries')
  }

  {
    const { error } = await anon.rpc('submit_customer_entry', {
      p_store_slug: slugA,
      p_request_id: randomUUID(),
      p_customer_name: 'Empty Pool',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 5000,
    })
    check('bracket without gifts raises explicit error', !!error, 'silently awarded something')
  }

  // ---- uniform distribution over the 3-gift pool ----
  {
    const counts = new Map()
    const draws = 300
    let drawError = null
    for (let i = 0; i < draws; i += 1) {
      const { data, error } = await anon.rpc('submit_customer_entry', {
        p_store_slug: slugA,
        p_request_id: randomUUID(),
        p_customer_name: 'Draw Customer',
        p_customer_phone: phoneSeq(),
        p_purchase_amount: 15000,
      })
      if (error) { drawError = error.message; break }
      const label = data[0].reward.name
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    const observed = [...counts.values()]
    const total = observed.reduce((s, n) => s + n, 0)
    const expected = total / observed.length
    const chi2 = observed.reduce((s, n) => s + ((n - expected) ** 2) / expected, 0)
    console.log(`      distribution: ${JSON.stringify(Object.fromEntries(counts))} chi2=${chi2.toFixed(2)}`)
    check('selection is uniform over the pool (chi-square df=2 < 13.8)',
      !drawError && observed.length === 3 && chi2 < 13.8, drawError ?? `chi2=${chi2.toFixed(2)}`)
  }

  // ---- configuration changes never alter saved rewards ----
  {
    const before = await service.from('submissions')
      .select('reward_label, reward_wheel_label').eq('id', firstSubmission.submission_id).single()
    await platform.from('gift_catalog').update({ name: `RENAMED ${run}`, wheel_label: 'RENAMED' }).in('id', giftIds)
    const after = await service.from('submissions')
      .select('reward_label, reward_wheel_label').eq('id', firstSubmission.submission_id).single()
    check('catalogue rename does not rewrite saved rewards', before.data?.reward_label === after.data?.reward_label)
    await ownerA.rpc('save_store_gift_options', { p_tier_id: tierA2.id, p_catalog_gift_ids: [] })
    const afterClear = await service.from('submissions')
      .select('reward_label').eq('id', firstSubmission.submission_id).single()
    check('clearing the pool does not rewrite saved rewards', before.data?.reward_label === afterClear.data?.reward_label)
  }

  // ---- collection ----
  {
    const { error: first } = await ownerA.rpc('mark_submission_collected', {
      p_submission_id: firstSubmission.submission_id,
    })
    check('owner collects own submission', !first, first?.message)
    await expectError('double collection rejected', ownerA.rpc('mark_submission_collected', {
      p_submission_id: firstSubmission.submission_id,
    }), 'already been collected')
    await expectError('owner B cannot collect owner A submission', ownerB.rpc('mark_submission_collected', {
      p_submission_id: firstSubmission.submission_id,
    }), 'not found')
    const { data: row } = await service.from('submissions')
      .select('collection_status, collected_by').eq('id', firstSubmission.submission_id).single()
    check('collection records collector identity', row?.collection_status === 'collected' && row?.collected_by === aUser.id)
  }

  // ---- cross-tenant isolation ----
  {
    const { data: bRows } = await ownerB.from('submissions').select('id').eq('store_id', shopA.shop_id)
    check('owner B sees none of shop A submissions', !bRows || bRows.length === 0)
    const { data: aRows } = await ownerA.from('submissions').select('id')
    check('owner A sees own submissions', (aRows?.length ?? 0) > 0)
    const { data: upd } = await ownerB.from('stores').update({ name: 'stolen' }).eq('id', shopA.shop_id).select()
    check('owner B cannot rename shop A', !upd || upd.length === 0)
    const { data: rew } = await ownerB.from('rewards').update({ name: 'stolen' }).eq('store_id', shopA.shop_id).select()
    check('owner B cannot edit shop A rewards', !rew || rew.length === 0)
  }

  // ---- legacy single-reward brackets preserved (shop B) ----
  {
    const { data: legacyReward, error: lrErr } = await ownerB.from('rewards').insert({
      store_id: shopB.shop_id,
      name: `Legacy Gift ${run}`,
      wheel_label: 'LEGACY',
      description: 'legacy reward',
      claim_code_prefix: 'GIFT',
      active: true,
    }).select().single()
    check('owner creates legacy reward', !lrErr, lrErr?.message)

    const { data: bTiers } = await service.from('reward_tiers').select('*').eq('store_id', shopB.shop_id).order('min_amount')
    const payload = bTiers.map((t) => ({
      id: t.id, min_amount: t.min_amount, max_amount: t.max_amount,
      reward_id: legacyReward.id, target_segment: t.target_segment, active: t.active,
    }))
    const { error: saveErr } = await ownerB.rpc('save_store_tiers', { p_tiers: payload })
    check('legacy save_store_tiers still works for owners', !saveErr, saveErr?.message)

    // cross-tenant tier access via the legacy RPC is rejected
    await expectError('owner B cannot touch shop A tiers via legacy RPC', ownerB.rpc('save_store_tiers', {
      p_tiers: [{
        id: tierA2.id, min_amount: 1000, max_amount: null, reward_id: legacyReward.id,
        target_segment: 0, active: true,
      }],
    }), 'belongs to another store')

    const { data: legacyDraw, error: ldErr } = await anon.rpc('submit_customer_entry', {
      p_store_slug: slugB,
      p_request_id: randomUUID(),
      p_customer_name: 'Legacy Customer',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 15000,
    })
    check('legacy fallback assigns the tier reward', !ldErr && legacyDraw?.[0]?.reward?.name === `Legacy Gift ${run}`,
      ldErr?.message ?? JSON.stringify(legacyDraw?.[0]?.reward))
  }

  // ---- inactive shop rejects new entries ----
  {
    await platform.rpc('set_store_status', { p_store_id: shopB.shop_id, p_status: 'suspended' })
    const { error } = await anon.rpc('submit_customer_entry', {
      p_store_slug: slugB,
      p_request_id: randomUUID(),
      p_customer_name: 'Blocked Customer',
      p_customer_phone: phoneSeq(),
      p_purchase_amount: 15000,
    })
    check('suspended shop rejects new submissions', !!error && error.message.includes('Campaign is unavailable'), error?.message)
    await platform.rpc('set_store_status', { p_store_id: shopB.shop_id, p_status: 'active' })
  }

  // ---- pools remain hidden from anon after configuration ----
  {
    const { data: anonPool } = await anon.from('tier_gift_options').select('reward_id')
    check('anon pool read stays empty after configuration', !anonPool || anonPool.length === 0)
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
    await service.from('store_admins').delete().eq('store_id', id)
    await service.from('stores').delete().eq('id', id)
  }
  if (createdGiftIds.length > 0) {
    await service.from('gift_catalog').delete().in('id', createdGiftIds)
  }
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id).catch(() => {})
  }
}

main()
  .catch((err) => {
    fail += 1
    console.error('FATAL', err)
  })
  .finally(async () => {
    await cleanup()
    console.log(`\nRESULT ${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
  })
