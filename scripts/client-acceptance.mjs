#!/usr/bin/env node
// Client-instance browser acceptance for JRIQ shops (final brief steps 5-6).
//
// Drives the REAL app build in Chromium against a served `dist`, for ANY shop
// slug - the exact Shree Jewellers customer journey and admin surfaces, driven
// purely by that shop's saved configuration (identity, logo/fallback, review
// destination, prizes). Scenarios:
//
//   --scenario journey    Welcome -> Details (validation gate) -> persist ->
//                         optional review invitation -> Share Your Experience
//                         modal (10 one-click cards; a tap copies AND opens
//                         the shop's OWN configured Google destination) ->
//                         Skip for now -> WELCOME BACK! (incl. across reload)
//                         -> Spin Now -> saved-reward reveal with claim code ->
//                         thank-you (never claims a review was posted)
//   --scenario inactive   the designed "campaign is not active" page (draft
//                         shops), never a fake spin
//   --scenario admin      login wall -> owner dashboard -> Campaign config
//                         round-trip (--config-prizes: create synthetic
//                         rewards + purchase tiers through the owner UI,
//                         save, RELOAD and assert the same saved values) ->
//                         settings shows the exact saved review URL and the
//                         logo upload control -> QR targets https://jriq.in/{slug}
//                         -> sign out returns to the wall
//
// Claim-creating: the journey scenario submits customer entries. Run against
// STAGING builds only (synthetic data). Never point --scenario journey at
// production. The admin scenario writes ONLY with --config-prizes, which is
// staging-only synthetic data.
//
// Admin credentials come from --admin-creds <file.json> ({email,password}) and
// are NEVER printed. Evidence screenshots land in --out (default
// %TEMP%/jriq-client-acceptance).
//
// Usage:
//   node scripts/client-acceptance.mjs --slug <slug> --scenario journey|inactive|admin
//        [--expect-logo <url>] [--expect-fallback] [--review-match <substring>]
//        [--config-prizes] [--admin-creds <file>] [--amount <n>] [--out <dir>]
//
// Exit 0 = every check passed.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const SLUG = argValue('--slug')
const SCENARIO = argValue('--scenario', 'journey')
const EXPECT_LOGO = argValue('--expect-logo')
const EXPECT_FALLBACK = args.includes('--expect-fallback')
const REVIEW_MATCH = argValue('--review-match', 'google.com')
const REVIEW_URL_EXPECTED = argValue('--review-url')
const CONFIG_PRIZES = args.includes('--config-prizes')
const ADMIN_CREDS = argValue('--admin-creds')
const AMOUNT = argValue('--amount', '2000')
const OUT = argValue('--out', join(tmpdir(), 'jriq-client-acceptance'))
// Default against the local preview of the release build; --base runs the same
// checks against a live origin (e.g. https://jriq.in) without starting a server.
const BASE = argValue('--base') || 'http://127.0.0.1:4173'

if (!SLUG) {
  console.error('Usage: node scripts/client-acceptance.mjs --slug <slug> --scenario journey|inactive|admin ...')
  process.exit(2)
}
if (CONFIG_PRIZES && SCENARIO === 'journey' && BASE.includes('jriq.in')) {
  console.error('Refusing: --config-prizes is for staging runs only')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })

const PHONE = `9${String(100000000 + Math.floor(Math.random() * 899999999))}`
const SYNTH_A = 'Synthetic Staging Gift A'
const SYNTH_B = 'Synthetic Staging Gift B'

let pass = 0
let fail = 0
const consoleErrors = []
const failedRequests = []
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
// Some vendor forms render <label> without htmlFor/id association, so
// getByLabel cannot resolve them; locate the control as the label's next
// sibling instead (FormField renders label + control adjacently).
function fieldAfter(page, label) {
  return page.locator(`xpath=//label[contains(normalize-space(.), ${JSON.stringify(label)})]/following-sibling::*[1]`)
}
function fieldExact(page, label) {
  return page.locator(`xpath=//label[normalize-space(.) = ${JSON.stringify(label)}]/following-sibling::*[1]`)
}
async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${SLUG}-${name}.png`), fullPage: false })
}
async function serverUp() {
  try {
    return (await fetch(BASE)).ok
  } catch {
    return false
  }
}
async function startPreview() {
  if (await serverUp()) return null
  return spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    { stdio: 'ignore' },
  )
}

const preview = args.includes('--base') ? null : await startPreview()
if (!args.includes('--base')) {
  for (let i = 0; i < 60 && !(await serverUp()); i += 1) {
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!(await serverUp())) {
    console.error('vite preview did not start (build dist first)')
    process.exit(2)
  }
}

const browser = await chromium.launch()

async function newPage(viewport, tag) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 })
  const page = await ctx.newPage()
  watch(page, tag)
  return { ctx, page }
}

try {
  // =====================================================================
  // CUSTOMER SURFACE
  // =====================================================================
  const mobile = { width: 390, height: 844 }
  const desktop = { width: 1280, height: 800 }
  const { ctx, page } = await newPage(mobile, 'customer')
  await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  if (SCENARIO === 'inactive') {
    await page.getByText(/This campaign is not active right now/i).waitFor({ timeout: 15000 })
    check('draft shop shows the designed campaign-inactive page', true)
    check('draft shop never offers a spin', (await page.getByRole('button', { name: 'START', exact: true }).count()) === 0)
    check('no horizontal overflow (inactive page, mobile)', await noOverflow(page))
    await shot(page, 'inactive-mobile')
    const d = await newPage(desktop, 'customer-desktop')
    await d.page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' })
    await d.page.getByText(/This campaign is not active right now/i).waitFor({ timeout: 15000 })
    check('no horizontal overflow (inactive page, desktop)', await noOverflow(d.page))
    await shot(d.page, 'inactive-desktop')
    await d.ctx.close()
  } else {
    await page.getByRole('button', { name: 'START', exact: true }).waitFor({ timeout: 15000 })
    check('welcome renders with the shop identity', true)

    if (EXPECT_FALLBACK) {
      const imgCount = await page.locator('img.store-logo-image').count()
      const monoCount = await page.locator('svg[aria-label$="logo"]').count()
      check('no-logo shop shows the clean fallback monogram', imgCount === 0 && monoCount >= 1, `img=${imgCount} mono=${monoCount}`)
    }
    if (EXPECT_LOGO) {
      const src = await page.locator('img.store-logo-image').getAttribute('src')
      check('shop logo is the configured logo URL', src === EXPECT_LOGO, String(src))
      check('logo rendered contained in the stable area', await page.locator('img.store-logo-image').isVisible())
    }
    check('no horizontal overflow (welcome, mobile)', await noOverflow(page))
    await shot(page, 'welcome-mobile')

    // ---- Details + validation gate ----
    await page.getByRole('button', { name: 'START', exact: true }).click()
    await page.getByLabel('Full name').fill('Client Acceptance')
    await page.getByLabel('Purchase amount in Indian Rupees').fill('1')
    await page.getByLabel('10-digit mobile number').fill(PHONE)
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
    await page.waitForTimeout(500)
    check(
      'tiny amount is rejected by the eligibility gate',
      (await page.locator('[role="alert"], .text-red-600, .text-red-700').count()) > 0 ||
        (await page.getByText(/available on purchases of|minimum|at least/i).count()) > 0,
    )
    await shot(page, 'gate-mobile')

    if (SCENARIO === 'journey') {
      await page.getByLabel('Purchase amount in Indian Rupees').fill(AMOUNT)
      await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()

      // ---- Optional review invitation ----
      await page.getByText('SHARE YOUR EXPERIENCE').waitFor({ timeout: 20000 })
      check('persist-first: the saved entry opens the review invitation', true)
      check('review invitation skip path is visible', await page.getByRole('button', { name: /CONTINUE TO SPIN/i }).isVisible())
      await shot(page, 'invite-mobile')

      // ---- Share Your Experience modal (one-click cards) ----
      await page.getByRole('button', { name: /Leave a Google Review/i }).click()
      const dialog = page.getByRole('dialog', { name: 'Share Your Experience' })
      await dialog.waitFor({ timeout: 5000 })
      check('review assistant modal opens (Share Your Experience)', true)
      const cards = page.locator('.review-suggestion')
      check('exactly the ten review cards', (await cards.count()) === 10, `count=${await cards.count()}`)
      const footer = (await page.locator('footer button').allTextContents()).map((b) => b.trim())
      check(
        'footer actions are exactly Open Google / Skip for now',
        JSON.stringify(footer) === JSON.stringify(['Open Google', 'Skip for now']),
        JSON.stringify(footer),
      )
      await shot(page, 'review-modal-mobile')

      // ONE tap: copy + open THIS shop's configured destination
      await cards.first().click()
      let popupUrl = ''
      for (let i = 0; i < 24; i += 1) {
        const opened = ctx.pages().find((pg) => pg.url() !== page.url() && pg.url().startsWith('http') && !pg.url().startsWith(BASE))
        if (opened) {
          popupUrl = opened.url()
          await opened.close().catch(() => {})
          break
        }
        await page.waitForTimeout(250)
      }
      check(
        `one tap opens the shop's own configured Google destination (contains "${REVIEW_MATCH}")`,
        popupUrl.includes(REVIEW_MATCH),
        popupUrl,
      )
      const copied = await page.getByText(/Copied - paste it into your review/i).isVisible().catch(() => false)
      const manual = await page.getByText(/select and copy the text manually/i).isVisible().catch(() => false)
      check('tap feedback is truthful (Copied on success, manual help on failure)', copied || manual)
      await page.getByText(/Google is opening in a new tab/i).waitFor({ timeout: 5000 })
      await shot(page, 'review-after-tap-mobile')

      // ---- Skip -> welcome back (also survives a reload) ----
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
      await page.getByText('WELCOME BACK!').waitFor({ timeout: 10000 })
      check('return-from-Google shows WELCOME BACK!', true)
      check('welcome-back supporting line', (await page.getByText(/Ready to see what you/i).count()) > 0)
      check('welcome-back action is Spin Now', await page.getByRole('button', { name: 'Spin Now' }).isVisible())
      await shot(page, 'welcome-back-mobile')

      await page.reload({ waitUntil: 'networkidle' })
      await page.getByText('WELCOME BACK!').waitFor({ timeout: 15000 })
      check('the SAME saved claim restores WELCOME BACK! after a reload', true)

      // ---- Spin -> saved reward reveal -> thank you ----
      await page.getByRole('button', { name: 'Spin Now' }).click()
      await page.getByText(/YOU WON|CONGRATULATIONS/i).first().waitFor({ timeout: 30000 })
      const revealText = await page.locator('body').innerText()
      check('reveal shows a claim code', /[A-Z]{3,4}-[A-Z0-9]{4,}/.test(revealText), (revealText.match(/[A-Z]{3,4}-[A-Z0-9]{4,}/) ?? [''])[0])
      if (CONFIG_PRIZES) {
        // innerText wraps long names across lines; compare without whitespace
        const flat = revealText.replace(/\s+/g, '').toUpperCase()
        check(
          'reveal shows the complete saved reward for this amount (tier 1 gift)',
          flat.includes(SYNTH_A.replace(/\s+/g, '').toUpperCase()),
          revealText.slice(0, 120),
        )
      }
      check('reveal never claims a review was posted', !/review (was|is) (posted|submitted|published)/i.test(revealText))
      await shot(page, 'reveal-mobile')

      await page.getByRole('button', { name: /CONTINUE|DONE|THANK/i }).first().click()
      await page.waitForTimeout(600)
      const endText = await page.locator('body').innerText()
      check('flow ends on the thank-you screen', /THANK/i.test(endText), endText.slice(0, 80))
      check('thank-you never claims a review was submitted', !/review (was|is) (posted|submitted|published)/i.test(endText))
      await shot(page, 'thankyou-mobile')
    } else {
      // admin-only run: stop before submitting anything
      check('details form reachable (no submission performed)', await page.getByLabel('Full name').isVisible())
    }
  }
  await ctx.close()

  // =====================================================================
  // ADMIN SURFACE
  // =====================================================================
  if (SCENARIO === 'admin' || (SCENARIO === 'journey' && ADMIN_CREDS) || (SCENARIO === 'inactive' && ADMIN_CREDS)) {
    const creds = ADMIN_CREDS ? JSON.parse(readFileSync(ADMIN_CREDS, 'utf8')) : null
    const { ctx: actx, page: apage } = await newPage(desktop, 'admin')
    await apage.goto(`${BASE}/${SLUG}/admin`, { waitUntil: 'networkidle' })
    await apage.waitForTimeout(500)
    const wallText = await apage.locator('body').innerText()
    check('admin URL shows the login wall (never a dashboard unauthenticated)', /Sign in|Shop Owner Dashboard/i.test(wallText) && !/Total customers/i.test(wallText), wallText.slice(0, 60))
    await shot(apage, 'admin-wall-desktop')

    if (creds) {
      await apage.locator('input[type="email"]').fill(creds.email)
      await apage.locator('input[type="password"]').fill(creds.password)
      await apage.getByRole('button', { name: 'Sign in' }).click()
      await apage.waitForTimeout(1500)
      await apage.goto(`${BASE}/${SLUG}/admin/dashboard`, { waitUntil: 'networkidle' })
      await apage.waitForTimeout(600)
      const dashText = await apage.locator('body').innerText()
      check('authenticated dashboard loads for this shop', /customers|Overview|dashboard/i.test(dashText), dashText.slice(0, 80))
      await shot(apage, 'admin-dashboard-desktop')

      // ---- Campaign configuration round-trip (owner UI) ----
      await apage.goto(`${BASE}/${SLUG}/admin/rewards`, { waitUntil: 'networkidle' })
      await apage.getByRole('button', { name: 'Add reward' }).waitFor({ timeout: 10000 })
      if (CONFIG_PRIZES) {
        for (const [name, prefix] of [[SYNTH_A, 'SNA'], [SYNTH_B, 'SNB']]) {
          if ((await apage.getByText(name).count()) > 0) {
            check(`reward already present from a previous run: ${name}`, true)
            continue
          }
          await apage.getByRole('button', { name: 'Add reward' }).click()
          await fieldAfter(apage, 'Reward name').fill(name)
          await fieldAfter(apage, 'Claim code prefix').fill(prefix)
          await apage.getByRole('button', { name: 'Save reward' }).click()
          await apage.getByText(name).first().waitFor({ timeout: 15000 }).catch(() => null)
          const saved = await apage.getByText(name).count()
          if (saved === 0) {
            const alerts = await apage.locator('[role="alert"]').allInnerTexts()
            await shot(apage, 'admin-reward-save-failed')
            check(`owner created reward through the campaign UI: ${name}`, false, `alerts=${JSON.stringify(alerts).slice(0, 200)}`)
            const bodyNow = await apage.locator('body').innerText()
            console.log(`INFO  page state after save attempt: ${bodyNow.replace(/\s+/g, ' ').slice(0, 300)}`)
          } else {
            check(`owner created reward through the campaign UI: ${name}`, true)
          }
        }

        // tier 1: 1,000-4,999 -> Gift A ; tier 2: 5,000+ -> Gift B
        await apage.waitForFunction(() => {
          const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim() === 'Add tier')
          return Boolean(b && !b.disabled)
        }, undefined, { timeout: 10000 })
        const addTierOnce = async (min, max, rewardLabel) => {
          await apage.getByRole('button', { name: 'Add tier' }).click()
          await fieldAfter(apage, 'Minimum purchase').fill(min)
          await fieldAfter(apage, 'Maximum purchase').fill(max)
          await fieldExact(apage, 'Reward').selectOption({ label: rewardLabel })
          await apage.getByRole('button', { name: 'Save tier' }).click()
          await apage.waitForTimeout(900)
          const alerts = await apage.locator('[role="alert"]').allInnerTexts()
          return alerts
        }
        const alerts1 = await addTierOnce('1000', '4999', SYNTH_A)
        check('owner saved purchase range 1,000-4,999 through the campaign UI', alerts1.length === 0, alerts1.join(' | ').slice(0, 160))
        const alerts2 = await addTierOnce('5000', '', SYNTH_B)
        check('owner saved open-ended purchase range 5,000+ through the campaign UI', alerts2.length === 0, alerts2.join(' | ').slice(0, 160))
        check('owner created purchase ranges through the campaign UI', alerts1.length === 0 && alerts2.length === 0)
        await shot(apage, 'admin-campaign-configured')

        // reopen (reload) -> the same saved values must be there
        await apage.reload({ waitUntil: 'networkidle' })
        await apage.getByText(SYNTH_A).first().waitFor({ timeout: 10000 })
        const rewardsText = await apage.locator('body').innerText()
        check('reopened settings show reward 1 exactly as saved', rewardsText.includes(SYNTH_A))
        check('reopened settings show reward 2 exactly as saved', rewardsText.includes(SYNTH_B))
        check('reopened settings show the saved ranges', /1,000/.test(rewardsText) && /4,999/.test(rewardsText) && /5,000/.test(rewardsText), rewardsText.slice(0, 200))

        // boundary discipline through the owner UI: an overlapping bracket is refused
        await apage.getByRole('button', { name: 'Add tier' }).click()
        await fieldAfter(apage, 'Minimum purchase').fill('2000')
        await fieldAfter(apage, 'Maximum purchase').fill('3000')
        await fieldExact(apage, 'Reward').selectOption({ label: SYNTH_A })
        await apage.getByRole('button', { name: 'Save tier' }).click()
        await apage.waitForTimeout(600)
        const overlapErr = await apage.locator('[role="alert"]').allInnerTexts()
        check(
          'overlapping brackets are refused (one amount maps to exactly one bracket)',
          overlapErr.some((t) => /overlap|invalid|cover/i.test(t)),
          overlapErr.join(' | ').slice(0, 120),
        )
        await apage.getByRole('button', { name: 'Cancel' }).click()
      } else {
        check('campaign page renders for the owner (no unapproved prizes present)', true)
        const t = await apage.locator('body').innerText()
        check('unconfigured shop shows the setup state, not fake gifts', /No rewards yet|No tiers yet|Add your first/i.test(t), t.slice(0, 120))
      }
      await shot(apage, 'admin-campaign-desktop')

      // ---- Settings: saved review URL + logo upload control ----
      await apage.goto(`${BASE}/${SLUG}/admin/settings`, { waitUntil: 'networkidle' })
      await apage.waitForTimeout(800)
      const settingsInputs = await apage.evaluate(() =>
        Array.from(document.querySelectorAll('input, textarea')).map((el) => el.value ?? ''),
      )
      const settingsText = await apage.locator('body').innerText()
      check('settings page shows the brand/logo controls', /logo/i.test(settingsText))
      if (REVIEW_URL_EXPECTED) {
        check(
          'settings show the exact saved Google review destination',
          settingsInputs.some((v) => v === REVIEW_URL_EXPECTED),
          settingsInputs.filter((v) => v.startsWith('http')).join(' | ').slice(0, 160),
        )
      }
      await shot(apage, 'admin-settings-desktop')

      // ---- QR ----
      await apage.goto(`${BASE}/${SLUG}/admin/qr-code`, { waitUntil: 'networkidle' })
      await apage.waitForTimeout(800)
      const qrText = await apage.locator('body').innerText()
      check('QR page targets the canonical customer URL', qrText.includes(`jriq.in/${SLUG}`), qrText.slice(0, 120))
      check('QR page never shows legacy /store/ paths', !qrText.includes('/store/'))
      await shot(apage, 'admin-qr-desktop')

      // ---- sign out ----
      await apage.getByRole('button', { name: /sign out/i }).first().click()
      await apage.waitForTimeout(1200)
      const afterText = await apage.locator('body').innerText()
      check('sign out returns to the login wall', /Sign in|Shop Owner Dashboard/i.test(afterText))
    }
    await actx.close()
  }

  // ---- desktop overflow spot-check on the customer surface ----
  if (SCENARIO !== 'inactive') {
    const { ctx: dcx, page: dpage } = await newPage(desktop, 'desktop')
    await dpage.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' })
    await dpage.getByRole('button', { name: 'START', exact: true }).waitFor({ timeout: 15000 })
    check('no horizontal overflow (welcome, desktop)', await noOverflow(dpage))
    await shot(dpage, 'welcome-desktop')
    await dcx.close()
  }

  check('no console errors during the session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  check('no failed app requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  if (preview) preview.kill()
}

console.log(`RESULT ${pass} passed, ${fail} failed (client-acceptance ${SLUG}/${SCENARIO})`)
console.log(`INFO  screenshots ${OUT}`)
process.exit(fail === 0 ? 0 : 1)
