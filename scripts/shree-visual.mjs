// Shree Jewellers (shreejwellers) browser acceptance on STAGING.
//
// Drives the REAL app in Chromium against the staging backend build:
//   - the three customer URLs (canonical + costumer + customer aliases) render
//     the same Shree Jewellers configuration
//   - the validation gate, the persist-first customer flow, the review
//     assistant (7 chips, 10 starters, exactly Copy / Open Google Reviews /
//     Continue / Skip for now), the wheel reveal with the COMPLETE bundle
//     name incl. the coupon, the claim code, the thank-you screen
//   - the authenticated shop-owner admin workspace: login wall, dashboard,
//     customers + collection, settings, QR target, sign out
//   - the configured Google review destination resolves to Shree Jewellers
//   - console errors, failed requests and horizontal overflow at 390x844 and
//     desktop 1280x800
//
// Synthetic data only (staging). Screenshots land in %TEMP%/jriq-shree-visual.
//
// Usage (PowerShell):
//   <build the app with VITE_SUPABASE_URL/ANON_KEY pointing at staging first>
//   $env:SHREE_OWNER_EMAIL = 'shree-owner-staging@jriq-smoke.test'
//   $env:SHREE_OWNER_PASSWORD = '<staging owner password>'
//   $env:SUPABASE_STAGING_URL / _ANON_KEY / _SERVICE_KEY  (optional; enables cleanup)
//   node scripts/shree-visual.mjs
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const OWNER_EMAIL = process.env.SHREE_OWNER_EMAIL
const OWNER_PASSWORD = process.env.SHREE_OWNER_PASSWORD
const REVIEW_URL =
  'https://www.google.com/search?hl=en-IN&gl=in&q=PF32%2BCJV+Shree+Jewellers,+Jawaharnagar,+Maharashtra+416115&ludocid=1061963283657064940&lsig=AB86z5WxzN8H7u5nQ49b24LliIAr#lrd=0x3bc11d000be053c1:0xebcd9fadee301ec,3'
const BUNDLE = 'Bag + ₹1,200 Saree Coupon'
// A fresh synthetic phone per run: submit_customer_entry rate-limits entries
// per phone (5/hour) and repeated acceptance runs would trip it.
const PHONE = `9${String(100000000 + Math.floor(Math.random() * 899999999))}`
// --admin-only: run just the shop-owner admin journey (seeding one synthetic
// customer record first) for a targeted retest, before the full acceptance.
const ADMIN_ONLY = process.argv.includes('--admin-only')
const BASE = 'http://127.0.0.1:4173'
const EVIDENCE = join(tmpdir(), 'jriq-shree-visual')
mkdirSync(EVIDENCE, { recursive: true })

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('Missing SHREE_OWNER_EMAIL / SHREE_OWNER_PASSWORD')
  process.exit(2)
}

let pass = 0
let fail = 0
const consoleErrors = []
const failedRequests = []
const livePages = []
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}
function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`))
  page.on('requestfailed', (r) => {
    const url = r.url()
    if (url.startsWith(BASE)) failedRequests.push(`[${tag}] ${url} - ${r.failure()?.errorText ?? ''}`)
  })
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
}
async function shot(page, name) {
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true })
}

async function serverUp() {
  try {
    const res = await fetch(BASE)
    return res.ok
  } catch {
    return false
  }
}

async function startPreview() {
  // Reuse an already-running preview when present; otherwise spawn one via
  // node + vite's entry point (npx is blocked by the system execution policy).
  if (await serverUp()) return null
  const child = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    { stdio: 'ignore' },
  )
  return child
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    if (await serverUp()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview did not start')
}

async function seedSubmission() {
  const url = process.env.SUPABASE_STAGING_URL
  const key = process.env.SUPABASE_STAGING_ANON_KEY
  if (!url || !key) {
    throw new Error('admin-only mode needs SUPABASE_STAGING_URL/_ANON_KEY to seed a record')
  }
  const anon = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await anon.rpc('submit_customer_entry', {
    p_store_slug: 'shreejwellers',
    p_request_id: randomUUID(),
    p_customer_name: 'Shree QA Visual',
    p_customer_phone: PHONE,
    p_purchase_amount: 5000,
    p_review_cta_shown: true,
    p_review_cta_clicked: false,
  })
  if (error) throw new Error(`seed failed: ${error.message}`)
  console.log('INFO  seeded one synthetic customer record (admin-only run)')
}

async function main() {
  const preview = await startPreview()
  await waitForServer()
  const browser = await chromium.launch({ headless: true })
  try {
    // ================= mobile 390x844 =================
    // Each customer URL gets a fresh context: the customer flow persists its
    // in-progress claim on purpose (one claim per visit), so URL checks must
    // not inherit each other's step.
    const makeMobile = async (tag) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const p = await ctx.newPage()
      watch(p, tag)
      livePages.push({ tag, page: p })
      return { ctx, page: p }
    }

    // ---- the three customer URLs render the same shop ----
    if (!ADMIN_ONLY) {
    for (const [path, tag] of [
      ['/shreejwellers', 'shop-canonical'],
      ['/shreejwellers/costumer', 'shop-costumer'],
      ['/shreejwellers/customer', 'shop-customer'],
    ]) {
      const { ctx, page } = await makeMobile(tag)
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      const title = await page.title()
      check(`${path} renders the Shree Jewellers shop`, title.includes('Shree Jewellers'), title)
      check(`${path} hero is the waiting screen`, await page.getByText('YOUR REWARD IS WAITING').isVisible())
      check(`${path} shows the shop name`, await page.getByRole('heading', { name: 'Shree Jewellers' }).first().isVisible())
      // The customer flow opens on the welcome screen; step into the form.
      await page.getByRole('button', { name: 'START', exact: true }).click()
      await page.getByLabel('Full name').waitFor({ timeout: 10000 })
      check(`${path} form label: Full name`, await page.getByLabel('Full name').isVisible())
      check(
        `${path} form label: Purchase amount in Indian Rupees`,
        await page.getByLabel('Purchase amount in Indian Rupees').isVisible(),
      )
      check(
        `${path} form label: 10-digit mobile number`,
        await page.getByLabel('10-digit mobile number').isVisible(),
      )
      check(`${path} has no horizontal overflow (390x844)`, await noOverflow(page))
      await shot(page, `01-${tag}-mobile`)
      await ctx.close()
    }
    }

    // ---- validation gate + customer flow (fresh context) ----
    const { ctx: flowCtx, page } = await makeMobile('flow')
    if (ADMIN_ONLY) {
      await seedSubmission()
    } else {
    await page.goto(`${BASE}/shreejwellers/costumer`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'START', exact: true }).click()
    await page.getByLabel('Full name').fill('Shree QA Visual')
    await page.getByLabel('Purchase amount in Indian Rupees').fill('4999')
    await page.getByLabel('10-digit mobile number').fill(PHONE)
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
    await page.waitForTimeout(400)
    check(
      '₹4,999 is rejected by the ₹5,000 gate',
      await page.getByText(/available on purchases of/i).isVisible(),
    )
    await shot(page, '02-gate-4999-mobile')

    // ---- customer flow at ₹5,000 (Tier 1 bundle) ----
    await page.getByLabel('Purchase amount in Indian Rupees').fill('5000')
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
    await page.getByText('SHARE YOUR EXPERIENCE').waitFor({ timeout: 15000 })
    check('entry saved and the review step opens', true)
    await shot(page, '03-review-step-mobile')

    await page.getByRole('button', { name: /Leave a Google Review/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Share Your Experience' })
    await dialog.waitFor({ timeout: 5000 })
    check('review assistant title is Share Your Experience', true)
    const chips = await page.locator('.review-topic').allTextContents()
    check(
      'exactly the seven approved topic chips',
      JSON.stringify(chips.map((c) => c.trim())) ===
        JSON.stringify(['Service', 'Collection', 'Staff', 'Quality', 'Price', 'Shopping Experience', 'My Visit']),
      JSON.stringify(chips),
    )
    check('exactly the ten approved review starters', (await page.locator('.review-suggestion').count()) === 10)
    const footerButtons = await page.locator('footer button').allTextContents()
    check(
      'assistant primary actions are exactly Copy / Open Google Reviews / Continue / Skip for now',
      JSON.stringify(footerButtons.map((b) => b.trim())) ===
        JSON.stringify(['Copy', 'Open Google Reviews', 'Continue', 'Skip for now']),
      JSON.stringify(footerButtons),
    )
    await shot(page, '04-review-assistant-mobile')

    // A starter inserts editable text (the customer writes; nothing is posted).
    await page.locator('.review-suggestion').first().click()
    const written = await page.getByRole('textbox', { name: 'Your review text' }).inputValue()
    check('a starter inserts editable review text', written.trim().length > 0, written.slice(0, 48))

    // Open Google Reviews opens the configured destination (no auto-continue).
    await page.getByRole('button', { name: 'Open Google Reviews' }).click()
    // noopener popups surface as new context pages (not opener "popup" events).
    let popupUrl = ''
    for (let i = 0; i < 24; i += 1) {
      const opened = flowCtx.pages().find((pg) => pg.url().includes('google.com'))
      if (opened) {
        popupUrl = opened.url()
        await opened.close().catch(() => {})
        break
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    check(
      'Open Google Reviews opens the configured shop review destination',
      popupUrl.includes('google.com'),
      popupUrl,
    )
    await page.getByText(/Google is opening in a new tab/i).waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    // ---- return screen + wheel + reveal ----
    await page.getByRole('heading', { name: 'WELCOME BACK!' }).waitFor({ timeout: 10000 })
    check('return screen says WELCOME BACK!', true)
    check(
      'return screen: Ready to see what you have won?',
      await page.getByText("Ready to see what you've won?").isVisible(),
    )
    check('return screen action is Spin Now', await page.getByRole('button', { name: 'Spin Now' }).isVisible())
    await shot(page, '05-spin-screen-mobile')

    await page.getByRole('button', { name: 'Spin Now' }).click()
    await page.getByText(BUNDLE, { exact: false }).first().waitFor({ timeout: 30000 })
    check('reveal shows the COMPLETE bundle incl. the ₹1,200 Saree Coupon', true)
    check('reveal never conceals the coupon', await page.getByText('₹1,200 Saree Coupon').first().isVisible())
    const claimCode = await page.locator('text=/[A-Z]{2,}-[A-Z0-9]{8}/').first().textContent()
    check('reveal shows a claim code with the reward prefix', /[A-Z]+-[A-Z0-9]{8}/.test(claimCode ?? ''), String(claimCode))
    await shot(page, '06-reveal-bundle-mobile')

    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
    await page.getByRole('heading', { name: 'THANK YOU!' }).waitFor({ timeout: 10000 })
    check('flow ends on the thank-you screen', true)
    await shot(page, '07-thank-you-mobile')
    }

    // ---- shop-owner admin workspace ----
    await page.goto(`${BASE}/shreejwellers/admin`, { waitUntil: 'networkidle' })
    check(
      'admin URL shows the shop-owner login wall (not a public dashboard)',
      await page.getByText('Sign in to manage your campaign').isVisible(),
    )
    await shot(page, '08-admin-loginwall-mobile')
    await page.locator('input[type="email"]').fill(OWNER_EMAIL)
    await page.locator('input[type="password"]').fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    // VendorShell renders the shop identity twice: the desktop sidebar badge is
    // inside <aside> (hidden below lg) and the mobile top-bar badge is inside
    // <main> (hidden at lg+). Assert on the badge of THIS viewport's region so
    // the check always targets the visible, accessible copy.
    const nameBadge = page.locator('main').getByText('Shree Jewellers', { exact: true }).first()
    await nameBadge.waitFor({ timeout: 30000 })
    check('shop owner sign-in lands on their own workspace', true)
    check('the authenticated dashboard shows the Shree Jewellers shop identity', await nameBadge.isVisible())
    await shot(page, '09-admin-dashboard-mobile')

    await page.goto(`${BASE}/shreejwellers/admin/customers`, { waitUntil: 'networkidle' })
    await page.getByLabel('Search customers').fill('Shree QA Visual')
    await page.waitForTimeout(600)
    const rowBtn = page.locator('button:has-text("Shree QA Visual") >> visible=true').first()
    await rowBtn.waitFor({ timeout: 15000 })
    check('customer records are listed for the shop owner', await rowBtn.isVisible())
    await rowBtn.click()
    const detail = page.getByRole('dialog', { name: 'Customer detail' })
    await detail.waitFor({ timeout: 5000 })
    check(
      'vendor collection record names the complete bundle',
      await detail.locator('text=Saree Coupon >> visible=true').first().isVisible(),
    )
    await shot(page, '10-admin-customer-detail-mobile')
    await detail.getByRole('button', { name: /Mark (gift )?collected/i }).click()
    await detail.getByText('Collected', { exact: true }).waitFor({ timeout: 8000 })
    check('Mark Collected records the collection (badge flips to Collected)', true)
    check(
      'double collection is not offered in the UI',
      (await detail.getByRole('button', { name: /Mark (gift )?collected/i }).count()) === 0,
    )
    await shot(page, '11-admin-marked-collected-mobile')
    // The dialog has two "Close" controls: the full-screen backdrop (covered by
    // the panel) and the header X. Click the header one.
    await detail.locator('button[aria-label="Close"]:not(.absolute)').click()

    await page.goto(`${BASE}/shreejwellers/admin/settings`, { waitUntil: 'networkidle' })
    check(
      'settings hold the shop name',
      (await page.locator('input[value="Shree Jewellers"]').count()) >= 1,
    )
    check(
      'settings hold the configured Google review link',
      (await page.locator('input[value*="google.com"]').count()) >= 1,
    )
    await shot(page, '12-admin-settings-mobile')

    await page.goto(`${BASE}/shreejwellers/admin/qr-code`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const qrText = await page.locator('body').innerText()
    const qrArt = await page.locator('img, canvas, svg').count()
    check('QR page targets the shop customer URL', qrText.includes('/shreejwellers'), '')
    check('QR page renders a QR artwork', qrArt > 0, `elements=${qrArt}`)
    await shot(page, '13-admin-qr-mobile')

    // sign out (the mobile top-bar control; the sidebar copy is hidden at 390px)
    await page.locator('button[aria-label="Sign out"]').click()
    await page.waitForTimeout(800)
    check('sign out returns to the login wall', await page.getByText('Sign in to manage your campaign').isVisible())
    await flowCtx.close()

    // ================= desktop 1280x800 =================
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const dp = await desktop.newPage()
    watch(dp, 'desktop')
    livePages.push({ tag: 'desktop', page: dp })
    if (!ADMIN_ONLY) {
      await dp.goto(`${BASE}/shreejwellers`, { waitUntil: 'networkidle' })
      check('desktop shop page has no horizontal overflow', await noOverflow(dp))
      await shot(dp, '20-shop-desktop')
      await dp.goto(`${BASE}/shreejwellers/costumer`, { waitUntil: 'networkidle' })
      await shot(dp, '21-costumer-desktop')
    }
    await dp.goto(`${BASE}/shreejwellers/admin`, { waitUntil: 'networkidle' })
    await dp.locator('input[type="email"]').fill(OWNER_EMAIL)
    await dp.locator('input[type="password"]').fill(OWNER_PASSWORD)
    await dp.getByRole('button', { name: 'Sign in' }).click()
    // At desktop width the visible badge is the sidebar copy inside <aside>.
    const dpBadge = dp.locator('aside').getByText('Shree Jewellers', { exact: true }).first()
    await dpBadge.waitFor({ timeout: 30000 })
    check('desktop admin workspace loads after sign-in', true)
    check('desktop dashboard shows the Shree Jewellers shop identity', await dpBadge.isVisible())
    check('desktop admin workspace has no horizontal overflow', await noOverflow(dp))
    await shot(dp, '22-admin-desktop')
    await desktop.close()

    // ================= configured Google review destination =================
    if (!ADMIN_ONLY) {
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const gp = await gctx.newPage()
    let listingOk = false
    let listingDetail = ''
    try {
      await gp.goto(REVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await gp.waitForTimeout(2500)
      const body = await gp.locator('body').innerText()
      listingOk = /Shree Jewellers/i.test(body)
      listingDetail = listingOk ? 'listing identifies Shree Jewellers' : `page text: ${body.slice(0, 160)}`
    } catch (e) {
      listingDetail = `navigation failed: ${e?.message ?? e}`
    }
    check('configured review destination resolves to Shree Jewellers', listingOk, listingDetail)
    await shot(gp, '30-google-review-destination')
    await gctx.close()
    }

    // ================= cross-cutting =================
    check('no console errors during the session', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '))
    check('no failed requests to the app during the session', failedRequests.length === 0, failedRequests.slice(0, 5).join(' | '))

    // ================= cleanup (synthetic staging rows) =================
    if (process.env.SUPABASE_STAGING_URL && process.env.SUPABASE_STAGING_SERVICE_KEY) {
      const service = createClient(process.env.SUPABASE_STAGING_URL, process.env.SUPABASE_STAGING_SERVICE_KEY, {
        auth: { persistSession: false },
      })
      const { error } = await service.from('submissions').delete().eq('customer_name', 'Shree QA Visual')
      check('synthetic submissions removed', !error, error?.message ?? '')
      const { data: storeRow } = await service.from('stores').select('id').eq('slug', 'shreejwellers').limit(1)
      if (storeRow?.[0]?.id) {
        await service.from('public_submission_rate_limits').delete().eq('store_id', storeRow[0].id)
      }
    }

    console.log(`INFO  screenshots ${EVIDENCE}`)
    console.log(`RESULT ${pass} passed, ${fail} failed (shreejwellers browser acceptance)`)
    process.exit(fail ? 1 : 0)
  } catch (err) {
    // Preserve failure evidence: where each browser was, what it showed, and
    // what the console/network said. Written before the browsers close.
    console.error(`FAILURE EVIDENCE (screenshots in ${EVIDENCE})`)
    for (const { tag, page: pg } of livePages) {
      try {
        console.error(`--- ${tag}: url=${pg.url()}`)
        const txt = await pg.locator('body').innerText().catch(() => '')
        console.error(`--- ${tag}: visible text (first 700 chars) ---\n${txt.slice(0, 700)}`)
        await pg
          .screenshot({ path: join(EVIDENCE, `99-failure-${tag}.png`), fullPage: true })
          .catch(() => {})
      } catch {
        /* page may be gone */
      }
    }
    console.error(`--- console errors ---\n${consoleErrors.slice(0, 12).join('\n') || '(none)'}`)
    console.error(`--- failed requests ---\n${failedRequests.slice(0, 12).join('\n') || '(none)'}`)
    throw err
  } finally {
    await browser.close().catch(() => {})
    preview?.kill()
  }
}

main().catch((err) => {
  console.error(`FAIL  browser acceptance aborted - ${err?.message ?? err}`)
  process.exit(1)
})
