/**
 * End-to-end visual QA for the customer Spin & Win journey.
 *
 * Walks the REAL app in Chromium: Welcome → Details → Review → Skip → Spin →
 * physical wheel rotation → Reward → Thank You → Reset, then screenshots every
 * required mobile viewport and reports console errors, failed requests,
 * horizontal overflow and wheel-label geometry.
 *
 * Run: node scripts/e2e-qa.mjs [baseURL]   (defaults to http://127.0.0.1:4173)
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const SHOT_DIR = path.resolve('qa-shots')
const VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 392, height: 850 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
]

const failures = []
const notes = []
const check = (ok, msg) => (ok ? notes.push(`PASS: ${msg}`) : failures.push(msg))

async function hasHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []
  const failedRequests = []

  // ---------------------------------------------------------- main flow @ 390x844
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`))

  await page.goto(`${BASE}/store/jolly-enterprises`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // WELCOME
  const h1 = await page.locator('h1').first().textContent()
  check(/THANK YOU FOR SHOPPING/i.test(h1 ?? ''), `welcome heading present (got: "${h1?.trim()}")`)
  check(await page.locator('img[alt*="logo"]').first().isVisible().catch(() => false), 'store logo visible on welcome')
  const bodyText = await page.locator('body').innerText()
  check(!/jolly enterprises|jholly/i.test(bodyText), 'no guessed business name (Jolly/Jholly) anywhere')
  await page.screenshot({ path: path.join(SHOT_DIR, '01-welcome-390.png'), fullPage: true })
  check(!(await hasHorizontalOverflow(page)), 'welcome: no horizontal overflow')

  // DETAILS
  await page.getByRole('button', { name: 'START' }).click()
  await page.waitForTimeout(350)
  const inputs = page.locator('input')
  const n = await inputs.count()
  check(n === 3, `details form has exactly 3 inputs (got ${n})`)
  const phoneType = await inputs.nth(2).getAttribute('type')
  check(phoneType === 'tel', `phone input is type=tel (got ${phoneType})`)
  await page.getByRole('button', { name: /continue|proceed|next|spin/i }).first().click().catch(() => {})
  await page.waitForTimeout(250)
  const vt = await page.locator('body').innerText()
  check(/please enter your name/i.test(vt), 'validation: name required message')
  check(/please enter a valid 10-digit mobile number/i.test(vt), 'validation: 10-digit phone message')
  await page.screenshot({ path: path.join(SHOT_DIR, '02-details-validation-390.png'), fullPage: true })

  // fill: ₹1,25,000 -> ₹1,000 voucher
  await inputs.nth(0).fill('Aarav Sharma')
  await inputs.nth(1).click()
  await inputs.nth(1).fill('125000')
  await page.waitForTimeout(150)
  const amtValue = await inputs.nth(1).inputValue()
  check(amtValue.includes('1,25,000'), `amount formats with Indian grouping (got "${amtValue}")`)
  await inputs.nth(2).fill('9876543210')
  await page.screenshot({ path: path.join(SHOT_DIR, '03-details-filled-390.png'), fullPage: true })
  await page.getByRole('button', { name: /continue|proceed|next|spin/i }).first().click()
  await page.waitForTimeout(400)

  // REVIEW INVITATION (optional)
  const reviewSeen = await page.getByText(/ENJOYED YOUR EXPERIENCE|SHARE YOUR EXPERIENCE/i).count()
  check(reviewSeen > 0, 'review invitation step shown')
  if (reviewSeen > 0) {
    await page.screenshot({ path: path.join(SHOT_DIR, '04-review-invitation-390.png'), fullPage: true })
    await page.getByRole('button', { name: /skip|continue to spin/i }).first().click()
    await page.waitForTimeout(400)
  }

  // SPIN
  const spinBtn = page.getByRole('button', { name: /spin/i }).first()
  await spinBtn.waitFor({ state: 'visible', timeout: 5000 })
  const spinBox = await spinBtn.boundingBox()
  check(!!spinBox && spinBox.width >= 44 && spinBox.height >= 44, `SPIN hit area >= 44px (${spinBox?.width}x${spinBox?.height})`)
  if (spinBox) {
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return { tag: el?.tagName, text: el?.textContent?.slice(0, 40), ok: !!el?.closest('button') }
    }, [spinBox.x + spinBox.width / 2, spinBox.y + spinBox.height / 2])
    check(hit.ok, `SPIN click point resolves to a button (got ${hit.tag}: "${hit.text}")`)
  }
  await page.screenshot({ path: path.join(SHOT_DIR, '05-spin-ready-390.png'), fullPage: true })

  // wheel label geometry BEFORE spin
  const labelReport = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="img"]')
    if (!svg) return null
    const svgBox = svg.getBoundingClientRect()
    return [...svg.querySelectorAll('text')].map((t) => {
      const r = t.getBoundingClientRect()
      return {
        text: t.textContent,
        insideSvg: r.left >= svgBox.left - 1 && r.right <= svgBox.right + 1 &&
                   r.top >= svgBox.top - 1 && r.bottom <= svgBox.bottom + 1,
      }
    })
  })
  check(labelReport && labelReport.length === 8, `wheel has 8 labels (got ${labelReport?.length ?? 0})`)
  if (labelReport) {
    check(labelReport.every((l) => l.insideSvg), 'all wheel labels inside SVG bounds')
    const overlapping = await page.evaluate(() => {
      const texts = [...document.querySelectorAll('svg[role="img"] text')].map((t) => t.getBoundingClientRect())
      const hits = []
      for (let i = 0; i < texts.length; i++)
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i], b = texts[j]
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push([i, j])
        }
      return hits
    })
    check(overlapping.length === 0, `no overlapping wheel labels (overlaps: ${JSON.stringify(overlapping)})`)
  }

  // SPIN: physical rotation proof
  const pickRotor = () => {
    const el = document.querySelector('.wheel-rotor, [class*="wheel"] g, svg[role="img"] g')
    return el ? getComputedStyle(el).transform : null
  }
  const rotBefore = await page.evaluate(pickRotor)
  await spinBtn.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOT_DIR, '06-spinning-390.png') })
  const rotMid = await page.evaluate(pickRotor)
  check(rotBefore !== rotMid, `wheel transform CHANGED after SPIN (${String(rotBefore).slice(0, 30)} -> ${String(rotMid).slice(0, 30)})`)
  check(await spinBtn.isDisabled().catch(() => false), 'SPIN disabled during spin (no double-submit)')

  // wait for reveal (animation ~4-6s)
  await page.getByText(/YOU WON/i).waitFor({ state: 'visible', timeout: 12000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '07-reward-390.png'), fullPage: true })
  const rewardText = await page.locator('body').innerText()
  check(/₹1,000|1000/i.test(rewardText), 'reward reveal matches ₹1,25,000 -> ₹1,000 voucher')
  check(/counter|collect/i.test(rewardText), 'gift collection instruction on reward screen')
  // THANK YOU / gift page
  await page.getByRole('button', { name: /continue|done|next/i }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOT_DIR, '08-thankyou-390.png'), fullPage: true })
  const thanks = await page.locator('body').innerText()
  check(/\*{2,}/.test(thanks), 'phone masked on confirmation screen')
  check(/counter/i.test(thanks), 'counter collection instruction on thank-you')

  // RESET
  await page.getByRole('button', { name: /submit another response/i }).click()
  await page.waitForTimeout(500)
  const afterReset = await page.locator('body').innerText()
  check(/thank you for shopping/i.test(afterReset), 'reset returns to welcome')
  check(!afterReset.includes('Aarav Sharma'), 'reset clears previous customer name')
  await ctx.close()

  // ---- Google review open + return (session must survive)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/store/jolly-enterprises`, { waitUntil: 'networkidle' })
  await p2.getByRole('button', { name: 'START' }).click()
  await p2.waitForTimeout(250)
  const ins = p2.locator('input')
  await ins.nth(0).fill('Test User')
  await ins.nth(1).click()
  await ins.nth(1).fill('50000')
  await ins.nth(2).fill('9123456789')
  await p2.getByRole('button', { name: /continue|proceed|next|spin/i }).first().click()
  await p2.waitForTimeout(400)
  const revBtn = p2.getByRole('button', { name: /google review/i }).first()
  if (await revBtn.count()) {
    const [popup] = await Promise.all([
      p2.waitForEvent('popup', { timeout: 4000 }).catch(() => null),
      revBtn.click(),
    ])
    check(!!popup && /google/.test(popup.url()), `Google review opens real Google URL (got: ${popup?.url() ?? 'none'})`)
    if (popup) await popup.close()
    await p2.waitForTimeout(300)
    check(await p2.locator('input').first().isVisible().catch(() => false), 'session intact after returning from Google')
  } else {
    notes.push('NOTE: no direct Google review button found on review step')
  }
  await ctx2.close()

  // ---- viewport sweep: screenshots + overflow + reachability
  for (const vp of VIEWPORTS) {
    const c = await browser.newContext({ viewport: vp })
    const pg = await c.newPage()
    await pg.goto(`${BASE}/store/jolly-enterprises`, { waitUntil: 'networkidle' })
    await pg.waitForTimeout(300)
    const tag = `${vp.width}x${vp.height}`
    await pg.screenshot({ path: path.join(SHOT_DIR, `vp-${tag}-welcome.png`), fullPage: true })
    check(!(await hasHorizontalOverflow(pg)), `${tag}: no horizontal scroll (welcome)`)

    await pg.getByRole('button', { name: 'START' }).click()
    await pg.waitForTimeout(300)
    await pg.screenshot({ path: path.join(SHOT_DIR, `vp-${tag}-details.png`), fullPage: true })
    check(!(await hasHorizontalOverflow(pg)), `${tag}: no horizontal scroll (details)`)

    const ins2 = pg.locator('input')
    await ins2.nth(0).fill('Priya Patil')
    await ins2.nth(1).click()
    await ins2.nth(1).fill('500000')
    await ins2.nth(2).fill('9000000000')
    await pg.getByRole('button', { name: /continue|proceed|next|spin/i }).first().click()
    await pg.waitForTimeout(400)
    const skip = pg.getByRole('button', { name: /skip|continue to spin/i })
    if (await skip.count()) { await skip.first().click(); await pg.waitForTimeout(400) }
    await pg.screenshot({ path: path.join(SHOT_DIR, `vp-${tag}-spin.png`), fullPage: true })
    check(!(await hasHorizontalOverflow(pg)), `${tag}: no horizontal scroll (spin)`)
    check(await pg.getByRole('button', { name: /spin/i }).first().isVisible().catch(() => false), `${tag}: SPIN button visible`)
    await c.close()
  }

  // ---- admin shell smoke test at desktop width
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const pA = await ctxA.newPage()
  await pA.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await pA.waitForTimeout(500)
  await pA.screenshot({ path: path.join(SHOT_DIR, '10-admin-1280.png'), fullPage: true })
  check(!(await hasHorizontalOverflow(pA)), 'admin: no horizontal scroll (1280)')
  await ctxA.close()

  await browser.close()

  // ---------------------------------------------------------------- report
  console.log('\n================ E2E QA REPORT ================')
  console.log(`base: ${BASE}`)
  console.log(`\n--- PASS (${notes.length}) ---`)
  for (const item of notes) console.log('  ' + item)
  if (failures.length) {
    console.log(`\n--- FAIL (${failures.length}) ---`)
    for (const f of failures) console.log('  X ' + f)
  }
  console.log(`\n--- console errors (${consoleErrors.length}) ---`)
  for (const e of consoleErrors.slice(0, 20)) console.log('  ' + e)
  console.log(`--- failed requests (${failedRequests.length}) ---`)
  for (const r of failedRequests.slice(0, 20)) console.log('  ' + r)
  console.log(`\nscreenshots: ${SHOT_DIR}`)
  process.exit(failures.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })

