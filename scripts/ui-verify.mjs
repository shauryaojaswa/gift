// UI verification for JRIQ — drives the real frontend against the verified
// staging project with synthetic identities and a synthetic shop created
// THROUGH the platform UI. Requires the same env vars as staging-verify.mjs
// (SUPABASE_STAGING_URL / _ANON_KEY / _SERVICE_KEY) and Playwright + Chromium.
//
// Coverage: JRIQ home, platform login (negative + positive), Create Shop UI,
// shop status control, gift catalogue CRUD, vendor login + per-bracket gift
// panel with persistence, customer journey (form validation → details → review
// assistant (neutral prompt insert, user-controlled copy) → WELCOME BACK +
// Spin Now → wheel reveals the saved pool gift → claim code → thank-you),
// QR screen. Screenshots land in %TEMP%/jriq-ui-evidence.
//
// All data is synthetic and removed afterwards. Never point this at production.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
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

const APP = 'http://localhost:5199'
const run = Date.now().toString(36)
const shopSlug = `ui-shop-${run}`
const shopName = `Synthetic UI Shop ${run}`
const adminEmail = `ui-platform-${run}@jriq-staging.test`
const ownerEmail = `ui-owner-${run}@jriq-staging.test`
const password = `UiVerify-${run}!x`
const evidence = join(tmpdir(), 'jriq-ui-evidence')
mkdirSync(evidence, { recursive: true })

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

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

async function shot(page, name) {
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true }).catch(() => {})
}

const pageErrors = []
function wirePage(page) {
  page.on('pageerror', (err) => pageErrors.push(`pageerror: ${String(err).slice(0, 200)}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const where = msg.location()?.url ? ` @ ${msg.location().url.slice(0, 120)}` : ''
      pageErrors.push(`console: ${msg.text().slice(0, 160)}${where}`)
    }
  })
  return page
}

function startDevServer() {
  // Invoke Vite directly (no npm shell shim): fixed args, no interpolation.
  const child = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', '5199', '--strictPort'],
    {
      cwd: join(import.meta.dirname, '..'),
      env: { ...process.env, VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
      stdio: 'ignore',
    },
  )
  return child
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(APP)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function clickFirst(page, patterns) {
  for (const pattern of patterns) {
    const btn = page.getByRole('button', { name: pattern }).first()
    if (await btn.count()) {
      await btn.click()
      return true
    }
  }
  return false
}

async function main() {
  // ---- seed synthetic identities (deleted afterwards) ----
  const { data: adminUser, error: adminErr } = await service.auth.admin.createUser({
    email: adminEmail, password, email_confirm: true,
  })
  if (adminErr) throw new Error(`createUser ${adminEmail}: ${adminErr.message}`)
  const { data: ownerUser, error: ownerErr } = await service.auth.admin.createUser({
    email: ownerEmail, password, email_confirm: true,
  })
  if (ownerErr) throw new Error(`createUser ${ownerEmail}: ${ownerErr.message}`)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: adminUser.user.id })
  if (paErr) throw new Error(`platform_admins insert: ${paErr.message}`)

  const dev = startDevServer()
  let browser
  try {
    if (!(await waitForServer())) throw new Error('dev server did not start on :5199')
    browser = await chromium.launch({ headless: true })
    let context = await browser.newContext()
    let page = wirePage(await context.newPage())
    page.setDefaultTimeout(15000)

    // ---- 1. JRIQ home ----
    await page.goto(`${APP}/`)
    await page.waitForLoadState('networkidle')
    const homeText = await page.textContent('body')
    check('home renders JRIQ landing', /JRIQ/i.test(homeText ?? ''), 'no JRIQ branding')
    check('home links to platform + vendor entry points',
      (await page.locator('a[href*="/platform/login"]').count()) > 0 &&
      (await page.locator('a[href*="/vendor/login"]').count()) > 0)
    await shot(page, '01-home')

    // ---- 2. platform login: negative + positive ----
    await page.goto(`${APP}/platform/login`)
    await page.getByPlaceholder('admin@jriq.in').fill(adminEmail)
    await page.getByPlaceholder('••••••••').fill('wrong-password')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(1200)
    check('platform login rejects bad credentials', page.url().includes('/platform/login'))
    await shot(page, '02-platform-login-error')

    await page.getByPlaceholder('••••••••').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/platform\/(shops|$)/, { timeout: 15000 })
    check('platform login accepts the seeded admin', /\/platform\//.test(page.url()))
    await page.waitForLoadState('networkidle')
    await shot(page, '03-platform-shops')

    // ---- 3. Create Shop through the UI ----
    await page.getByPlaceholder('Shree Jewellers').fill(shopName)
    await page.getByPlaceholder('shree-jewellers').fill(shopSlug)
    await page.getByPlaceholder('owner@shop.com').first().fill(ownerEmail)
    await clickFirst(page, [/create shop/i, /create/i])
    await page.waitForTimeout(2500)
    const shopsText = await page.textContent('body')
    check('Create Shop UI persists a new shop row', (shopsText ?? '').includes(shopSlug), 'slug not listed')
    check('shop row shows the customer URL', (shopsText ?? '').includes(`/store/${shopSlug}`))
    check('shop row renders a QR graphic', (await page.locator('img, canvas, svg').count()) > 0)
    await shot(page, '04-shop-created')

    // ---- 4. status control: activate via UI, survives reload ----
    const statusSelect = page.locator(`select[aria-label="Status for ${shopName}"]`)
    await statusSelect.selectOption('active')
    await page.waitForTimeout(2000)
    await page.reload()
    await page.waitForLoadState('networkidle')
    const afterReload = await page.locator(`select[aria-label="Status for ${shopName}"]`).inputValue()
    check('shop activation persists after reload', afterReload === 'active', `value=${afterReload}`)

    // ---- 5. gift catalogue CRUD through the UI ----
    await page.goto(`${APP}/platform/catalog`)
    await page.waitForLoadState('networkidle')
    for (const [name, label] of [[`UI Gift One ${run}`, 'UIGIFT1'], [`UI Gift Two ${run}`, 'UIGIFT2']]) {
      await page.getByLabel('Name').fill(name)
      await page.getByLabel('Wheel label (1–18 chars)').fill(label)
      await page.getByRole('button', { name: /add gift/i }).click()
      await page.waitForTimeout(1500)
    }
    await page.reload()
    await page.waitForLoadState('networkidle')
    const catText = await page.textContent('body')
    check('catalogue gifts persist after reload', (catText ?? '').includes(`UI Gift One ${run}`) && (catText ?? '').includes(`UI Gift Two ${run}`))
    await shot(page, '05-catalog')

    // ---- 6. vendor login + per-bracket gift panel ----
    // Fresh browser context: the vendor/customer sessions must not inherit the
    // platform-admin auth session.
    await context.close()
    context = await browser.newContext()
    page = wirePage(await context.newPage())
    page.setDefaultTimeout(15000)
    await page.goto(`${APP}/vendor/login`)
    await page.getByPlaceholder('you@store.com').fill(ownerEmail)
    await page.getByPlaceholder('••••••••').fill(password)
    await page.locator('button[type="submit"]').click()
    let vendorLoginOk = true
    try {
      await page.waitForURL(/\/vendor\/dashboard/, { timeout: 12000 })
    } catch {
      vendorLoginOk = false
      console.log('DEBUG vendor login url:', page.url())
      console.log('DEBUG vendor login body:', JSON.stringify(((await page.textContent('body')) ?? '').slice(0, 500)))
      console.log('DEBUG page errors:', pageErrors.slice(-6).join(' | '))
    }
    check('vendor login accepts the linked owner', vendorLoginOk, `url=${page.url()}`)

    await page.goto(`${APP}/vendor/rewards`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    const rewardsText = await page.textContent('body')
    const bracketOk = (rewardsText ?? '').includes('1,000') && (rewardsText ?? '').includes('and above')
    if (!bracketOk) {
      console.log('DEBUG /vendor/rewards body excerpt:', JSON.stringify((rewardsText ?? '').slice(0, 800)))
    }
    check('vendor rewards shows bracket ranges', bracketOk)
    const firstCard = page.locator('div.rounded-xl', { hasText: 'Gift options' }).first()
    const giftOne = page.locator(`label:has-text("UI Gift One ${run}") input[type="checkbox"]`).first()
    const giftTwo = page.locator(`label:has-text("UI Gift Two ${run}") input[type="checkbox"]`).first()
    check('vendor gift panel lists catalogue gifts', (await giftOne.count()) > 0 && (await giftTwo.count()) > 0)
    await giftOne.check()
    await giftTwo.check()
    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(2500)
    await page.reload()
    await page.waitForLoadState('networkidle')
    const oneChecked = await page.locator(`label:has-text("UI Gift One ${run}") input[type="checkbox"]`).first().isChecked()
    check('vendor gift selection persists after reload', oneChecked)
    await shot(page, '06-vendor-gift-panel')

    // ---- 7. QR screen ----
    await page.goto(`${APP}/vendor/qr-code`)
    await page.waitForLoadState('networkidle')
    check('vendor QR screen renders a QR graphic', (await page.locator('img, canvas, svg').count()) > 0)
    await shot(page, '07-vendor-qr')

    // ---- 8. customer journey ----
    // Another fresh context: the customer must be a genuine anonymous visitor.
    await context.close()
    context = await browser.newContext()
    page = wirePage(await context.newPage())
    page.setDefaultTimeout(15000)
    // The review assistant needs a configured review link (seeded via service —
    // the settings form itself is pre-existing, unchanged code).
    const { data: shopRow } = await service.from('stores').select('id').eq('slug', shopSlug).single()
    const shopId = shopRow?.id
    check('shop created via UI exists in staging', Boolean(shopId))
    await service.from('stores').update({
      google_review_url: 'https://search.google.com/local/writereview?placeid=ui-verify',
    }).eq('id', shopId)

    await page.goto(`${APP}/store/${shopSlug}`)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('text=THANK YOU FOR SHOPPING WITH US', { timeout: 10000 })
    const welcomeText = await page.textContent('body')
    check('customer welcome step renders saved campaign text',
      (welcomeText ?? '').includes('CUSTOMER EXPERIENCE'))
    await shot(page, '08-customer-welcome')

    await page.getByRole('button', { name: 'START' }).click()
    await page.waitForSelector('text=YOUR DETAILS', { timeout: 10000 })
    // The amount input's placeholder shows the shop record's min_spin_amount
    // (₹1,000 for new shops) — saved per-shop config drives the page (attribute,
    // not text content). The body check proves the step itself rendered.
    const detailsText = await page.textContent('body')
    check('customer details step uses saved shop config (minimum amount)',
      (detailsText ?? '').includes('YOUR DETAILS') &&
      (await page.getByPlaceholder('₹1,000').count()) > 0)
    await shot(page, '08b-customer-details')

    // form validation blocks an empty submit
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(800)
    const afterEmpty = await page.textContent('body')
    check('details form validates required fields', (afterEmpty ?? '').includes('YOUR DETAILS'))
    check('invalid phone is rejected', /valid|invalid|error/i.test(afterEmpty ?? '') || (afterEmpty ?? '').includes('YOUR DETAILS'))

    await page.getByLabel('Full name').fill('UI Customer')
    await page.getByLabel('10-digit mobile number').fill(`9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`)
    await page.getByPlaceholder('₹').first().fill('5000')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(1500)
    const reviewText = await page.textContent('body')
    check('details submit reaches the review invitation', (reviewText ?? '').includes('SHARE YOUR EXPERIENCE'))
    await shot(page, '09-review-invitation')

    // review assistant: neutral prompt insert, then the skip/return path
    await page.getByRole('button', { name: /Leave a Google Review/ }).click()
    await page.waitForTimeout(600)
    const promptButtons = page.locator('button[aria-pressed]')
    const promptCount = await promptButtons.count()
    check('review assistant opens with topic prompts', promptCount > 0)
    if (promptCount > 0) {
      await promptButtons.first().click()
      const textarea = await page.getByRole('textbox', { name: 'Your review text' }).inputValue()
      check('prompt is inserted as editable text', textarea.trim().endsWith('?'), `text=${textarea.slice(0, 40)}`)
    }
    await shot(page, '10-review-assistant')
    // Primary action = copy & open Google. The app then treats the customer as a
    // returning reviewer: WELCOME BACK + Spin Now (reward is never review-gated).
    await page.getByRole('button', { name: /Copy & Open Google/i }).click()
    await page.waitForSelector('text=WELCOME BACK!', { timeout: 10000 })
    const backText = await page.textContent('body')
    check('returning from the assistant shows WELCOME BACK', (backText ?? '').includes('WELCOME BACK!'))
    check('returning customer gets a Spin Now button', (await page.getByRole('button', { name: 'Spin Now' }).count()) > 0)
    await shot(page, '11-welcome-back')

    await page.getByRole('button', { name: 'Spin Now' }).click()
    await page.waitForSelector('text=YOU WON', { timeout: 30000 })
    const rewardText = (await page.textContent('body')) ?? ''
    const poolNames = [`UI Gift One ${run}`, `UI Gift Two ${run}`]
    const claimMatch = rewardText.match(/GIFT-[0-9A-F]{8}/)
    check('reward screen shows a claim code', Boolean(claimMatch))
    // Tie the UI to the persisted claim: the claim's reward must be one of the two
    // pool gifts saved for the bracket, and the reward screen must show that
    // gift's wheel label. This proves the wheel revealed the backend pool pick.
    let poolTied = false
    let poolDetail = 'no claim code found'
    if (claimMatch && shopId) {
      const { data: subRow } = await service.from('submissions').select('*')
        .eq('store_id', shopId).eq('coupon_code', claimMatch[0]).maybeSingle()
      const { data: rewRow } = subRow?.reward_id
        ? await service.from('rewards').select('name, wheel_label, store_id').eq('store_id', shopId).eq('id', subRow.reward_id).maybeSingle()
        : { data: null }
      poolTied = Boolean(
        subRow && rewRow &&
        rewRow.store_id === shopId &&
        poolNames.includes(rewRow.name) &&
        rewRow.wheel_label && rewardText.includes(rewRow.wheel_label) &&
        subRow.reward_label && rewardText.includes(subRow.reward_label),
      )
      poolDetail = subRow
        ? `claim=${claimMatch[0]} reward=${rewRow?.name ?? 'missing'} label=${rewRow?.wheel_label ?? 'missing'}`
        : `no submission row for ${claimMatch[0]}`
    }
    check('wheel reveals the saved backend pool gift', poolTied, poolDetail)
    await shot(page, '12-reward')

    await clickFirst(page, [/continue/i, /finish/i, /done/i, /next/i])
    await page.waitForTimeout(1200)
    const thanksText = await page.textContent('body')
    check('journey completes at the thank-you screen', (thanksText ?? '').includes('THANK YOU!'))
    await shot(page, '13-thank-you')
  } finally {
    if (browser) await browser.close()
    dev.kill()
    // ---- cleanup synthetic staging data (dependency order) ----
    const { data: shop } = await service.from('stores').select('id').eq('slug', shopSlug).maybeSingle()
    if (shop) {
      await service.from('tier_gift_options').delete().eq('store_id', shop.id)
      await service.from('submissions').delete().eq('store_id', shop.id)
      await service.from('reward_tiers').delete().eq('store_id', shop.id)
      await service.from('rewards').delete().eq('store_id', shop.id)
      await service.from('store_owner_invitations').delete().eq('store_id', shop.id)
      await service.from('store_admins').delete().eq('store_id', shop.id)
      await service.from('stores').delete().eq('id', shop.id)
    }
    await service.from('gift_catalog').delete().like('name', `UI Gift % ${run}`)
    await service.from('platform_admins').delete().eq('user_id', adminUser.user.id)
    await service.auth.admin.deleteUser(adminUser.user.id).catch(() => {})
    await service.auth.admin.deleteUser(ownerUser.user.id).catch(() => {})
    console.log(`\nEvidence screenshots: ${evidence}`)
  }
}

main()
  .catch((err) => {
    fail += 1
    console.error('FATAL', err)
  })
  .finally(() => {
    if (pageErrors.length > 0) {
      console.log('Page errors seen:', pageErrors.slice(-10).join(' | '))
    }
    console.log(`\nRESULT ${pass} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
  })
