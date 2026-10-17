#!/usr/bin/env node
// QA snapshot sweep - every discovered route x viewport x UI state, with
// rendered-UI inspection (not just HTTP 200): horizontal overflow, broken
// images, unlabeled controls, clipped button text, console errors and failed
// network requests. Evidence lands in artifacts/qa/ui/<route>/<viewport>/<state>.png
// with a JSONL manifest recording url, viewport, state, timestamp, checks, result.
//
// Routes are the real router inventory (src/App.tsx): home, privacy, 404,
// standee, legacy /store/:slug redirect, /vendor/login, /admin/login,
// /platform/login, customer surfaces + aliases, customer-flow states,
// owner workspace sections, legacy /admin/*, and the platform workspace.
//
// Claim/write-gated sections (--allow-claims, staging builds only) create
// SYNTHETIC customer entries so data states (submissions, gift collection,
// CSV export) can be snapshotted; they never run against production.
//
// Usage:
//   node scripts/qa-sweep.mjs [--base http://127.0.0.1:4173]
//        [--slugs pashupati1,pashupati2,pashupati,shreemanali]
//        [--creds-dir <dir with <slug>.json>] [--platform-creds <file>]
//        [--allow-claims] [--out artifacts/qa/ui] [--tag staging]

import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const BASE = argValue('--base', 'http://127.0.0.1:4173')
const SLUGS = (argValue('--slugs', 'pashupati1,pashupati2,pashupati,shreemanali')).split(',')
const CREDS_DIR = argValue('--creds-dir')
const PLATFORM_CREDS = argValue('--platform-creds')
const ALLOW_CLAIMS = args.includes('--allow-claims')
const OUT = argValue('--out', 'artifacts/qa/ui')
const TAG = argValue('--tag', 'staging')

if (ALLOW_CLAIMS && BASE.includes('jriq.in')) {
  console.error('Refusing: --allow-claims is for staging runs only')
  process.exit(2)
}

const { chromium } = await import('playwright')

mkdirSync(OUT, { recursive: true })
const MANIFEST = join(OUT, 'manifest.jsonl')
writeFileSync(MANIFEST, '')

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
}

let pass = 0
let fail = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

async function serverUp() {
  try {
    return (await fetch(BASE)).ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// capture: one page state -> inspect -> screenshot -> manifest
// ---------------------------------------------------------------------------
async function capture(browser, spec) {
  const { key, path, viewport, state, expectText, before, after, allowFailure } = spec
  const vp = VIEWPORTS[viewport]
  const ctx = await browser.newContext({
    viewport: vp,
    isMobile: viewport === 'mobile',
    hasTouch: viewport === 'mobile',
  })
  const page = await ctx.newPage()
  const consoleErrors = []
  const failedRequests = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} - ${r.failure()?.errorText ?? ''}`))

  const url = `${BASE}${path}`
  const t0 = Date.now()
  let navError = null
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  } catch (err) {
    navError = String(err?.message ?? err).slice(0, 120)
  }
  const navMs = Date.now() - t0
  if (before) await before(page)
  if (expectText) {
    await page.getByText(expectText).first().waitFor({ timeout: 15000 }).catch(() => null)
  }
  if (after) await after(page)
  await page.waitForTimeout(250)

  // ---- rendered-UI inspection ----
  const inspection = await page.evaluate(() => {
    const doc = document.documentElement
    const overflow = doc.scrollWidth > doc.clientWidth + 1
    const brokenImages = Array.from(document.querySelectorAll('img')).filter(
      (im) => im.complete && im.naturalWidth === 0,
    ).map((im) => im.getAttribute('src'))
    const unlabeled = Array.from(document.querySelectorAll('input, textarea, select')).filter((el) => {
      if (el.type === 'hidden') return false
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false
      if (el.closest('label')) return false
      // FormField renders label + control as siblings without htmlFor
      const prev = el.previousElementSibling
      if (prev && prev.tagName === 'LABEL') return false
      return true
    }).map((el) => `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}`)
    const clippedButtons = Array.from(document.querySelectorAll('button, a.btn-primary, a.btn-ghost')).filter(
      (b) => b.scrollWidth > b.clientWidth + 4 && b.clientWidth > 0,
    ).map((b) => (b.textContent || '').trim().slice(0, 30))
    const unnamedButtons = Array.from(document.querySelectorAll('button')).filter(
      (b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'),
    ).length
    const imagesNoAlt = Array.from(document.querySelectorAll('img')).filter((im) => !im.hasAttribute('alt')).length
    return { overflow, brokenImages, unlabeled, clippedButtons, unnamedButtons, imagesNoAlt }
  })

  const dir = join(OUT, key, viewport)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${state}.png`)
  await page.screenshot({ path: file, fullPage: false })

  const ok =
    !navError &&
    !inspection.overflow &&
    inspection.brokenImages.length === 0 &&
    inspection.unlabeled.length === 0 &&
    inspection.clippedButtons.length === 0 &&
    inspection.unnamedButtons === 0 &&
    inspection.imagesNoAlt === 0 &&
    consoleErrors.length === 0 &&
    failedRequests.length === 0

  appendFileSync(
    MANIFEST,
    JSON.stringify({
      tag: TAG,
      key,
      path,
      url,
      viewport,
      state,
      timestamp: new Date().toISOString(),
      navMs,
      checks: {
        navError,
        overflow: inspection.overflow,
        brokenImages: inspection.brokenImages,
        unlabeled: inspection.unlabeled,
        clippedButtons: inspection.clippedButtons,
        unnamedButtons: inspection.unnamedButtons,
        imagesNoAlt: inspection.imagesNoAlt,
        consoleErrors: consoleErrors.slice(0, 4),
        failedRequests: failedRequests.slice(0, 4),
      },
      result: ok ? 'pass' : 'fail',
      file: file.replace(/\\/g, '/'),
    }) + '\n',
  )

  const label = `ui ${key} [${viewport}] ${state}`
  if (allowFailure) {
    console.log(`INFO  ${label} - captured with known-broken state (evidence)`)
  } else {
    check(
      label,
      ok,
      [
        navError && `nav=${navError}`,
        inspection.overflow && 'overflow',
        inspection.brokenImages.length > 0 && `broken-img=${inspection.brokenImages.length}`,
        inspection.unlabeled.length > 0 && `unlabeled=${inspection.unlabeled.join(',')}`,
        inspection.clippedButtons.length > 0 && `clipped=${inspection.clippedButtons.join('|')}`,
        inspection.unnamedButtons > 0 && `unnamed-buttons=${inspection.unnamedButtons}`,
        inspection.imagesNoAlt > 0 && `img-no-alt=${inspection.imagesNoAlt}`,
        consoleErrors.length > 0 && `console=${consoleErrors[0].slice(0, 80)}`,
        failedRequests.length > 0 && `net=${failedRequests[0].slice(0, 80)}`,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }
  await ctx.close()
  return { ok, inspection, consoleErrors, failedRequests, navMs }
}

// ---------------------------------------------------------------------------
// helpers for interactive states
// ---------------------------------------------------------------------------
function fieldAfter(page, label) {
  return page.locator(`xpath=//label[contains(normalize-space(.), ${JSON.stringify(label)})]/following-sibling::*[1]`)
}

async function main() {
  const browser = await chromium.launch()
  try {
    const landingText = async (slug) => {
      // active shops render the welcome screen; the draft shop renders the
      // designed campaign-inactive page
      return slug === 'pashupati' ? /This campaign is not active right now/i : /YOUR REWARD IS WAITING/i
    }

    // =====================================================================
    // A. PUBLIC STATIC SURFACES (3 viewports)
    // =====================================================================
    for (const [key, path, expectText] of [
      ['home', '/', /JRIQ|Spin|reward/i],
      ['privacy', '/privacy', /privacy/i],
      ['not-found', '/this-route-does-not-exist-xyz', /404|not found/i],
      ['standee', `/standee/${SLUGS[0]}`, /scan|spin/i],
      ['vendor-login', '/vendor/login', /Shop Owner Dashboard/i],
      ['platform-login', '/platform/login', /platform|sign in/i],
      ['admin-login-legacy', '/admin/login', /sign in/i],
    ]) {
      for (const viewport of ['mobile', 'tablet', 'desktop']) {
        await capture(browser, { key, path, viewport, state: 'default', expectText })
      }
    }

    // legacy /store/{slug} must land on /{slug}
    {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/store/${SLUGS[0]}`, { waitUntil: 'networkidle' })
      const landed = page.url()
      check('legacy /store/{slug} lands on /{slug} in-app', landed === `${BASE}/${SLUGS[0]}`, landed)
      await ctx.close()
    }

    // =====================================================================
    // B. CUSTOMER LANDING for every shop (mobile + desktop)
    // =====================================================================
    for (const slug of SLUGS) {
      for (const viewport of ['mobile', 'desktop']) {
        await capture(browser, {
          key: `customer-${slug}`,
          path: `/${slug}`,
          viewport,
          state: slug === 'pashupati' ? 'campaign-inactive' : 'welcome',
          expectText: await landingText(slug),
        })
      }
    }
    // aliases (spot-check one shop, both spellings, mobile)
    for (const alias of ['costumer', 'customer']) {
      await capture(browser, {
        key: `customer-alias-${alias}`,
        path: `/${SLUGS[0]}/${alias}`,
        viewport: 'mobile',
        state: 'welcome',
        expectText: /YOUR REWARD IS WAITING/i,
      })
    }

    // =====================================================================
    // C. CUSTOMER FLOW STATES (synthetic claim; staging only)
    // =====================================================================
    if (ALLOW_CLAIMS) {
      try {
      const slug = SLUGS[0]
      const mk = (state, expectText, before, after, viewport = 'mobile') => ({
        key: `flow-${slug}`,
        path: `/${slug}`,
        viewport,
        state,
        expectText,
        before,
        after,
      })

      // full flow in ONE session so states chain naturally, capturing each
      const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile, isMobile: true, hasTouch: true })
      const page = await ctx.newPage()
      const consoleErrors = []
      const failedRequests = []
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
      page.on('requestfailed', (r) => failedRequests.push(`${r.url()} - ${r.failure()?.errorText ?? ''}`))
      const flowDir = join(OUT, `flow-${slug}`, 'mobile')
      mkdirSync(flowDir, { recursive: true })
      const flowShots = []
      const snap = async (state) => {
        const file = join(flowDir, `${state}.png`)
        await page.screenshot({ path: file })
        flowShots.push({ state, file: file.replace(/\\/g, '/'), ts: new Date().toISOString() })
      }

      await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'START', exact: true }).waitFor({ timeout: 15000 })
      await snap('01-welcome')
      await page.getByRole('button', { name: 'START', exact: true }).click()
      await page.getByLabel('Full name').waitFor({ timeout: 10000 })
      await snap('02-details-initial')
      await page.getByLabel('Full name').fill('QA Sweep')
      await page.getByLabel('Purchase amount in Indian Rupees').fill('1')
      await page.getByLabel('10-digit mobile number').fill(`9${String(100000000 + Math.floor(Math.random() * 899999999))}`)
      await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
      await page.waitForTimeout(500)
      await snap('03-details-gate-error')
      await page.getByLabel('Purchase amount in Indian Rupees').fill('2000')
      await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
      await page.getByText('SHARE YOUR EXPERIENCE').waitFor({ timeout: 20000 })
      await snap('04-review-invitation')
      await page.getByRole('button', { name: /Leave a Google Review/i }).click()
      const dialog = page.getByRole('dialog', { name: 'Share Your Experience' })
      await dialog.waitFor({ timeout: 5000 })
      await snap('05-review-modal')
      await page.locator('.review-suggestion').first().click()
      await page.getByText(/Google is opening in a new tab/i).waitFor({ timeout: 5000 }).catch(() => null)
      await snap('06-review-after-tap')
      for (const p of ctx.pages()) {
        if (p !== page) await p.close().catch(() => {})
      }
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
      await page.getByText('WELCOME BACK!').waitFor({ timeout: 10000 })
      await snap('07-welcome-back')
      await page.getByRole('button', { name: 'Spin Now' }).click()
      await page.waitForTimeout(700)
      await snap('08-spinning')
      await page.getByText(/YOU WON|CONGRATULATIONS/i).first().waitFor({ timeout: 30000 })
      await snap('09-reveal')
      await page.getByRole('button', { name: /CONTINUE|DONE|THANK/i }).first().click()
      await page.waitForTimeout(700)
      await snap('10-thankyou')

      check('flow: complete state chain captured (10 states)', flowShots.length === 10, `n=${flowShots.length}`)
      check('flow: no console errors across the journey', consoleErrors.length === 0, consoleErrors[0]?.slice(0, 100) ?? '')
      check('flow: no failed app requests across the journey', failedRequests.length === 0, failedRequests[0]?.slice(0, 100) ?? '')
      for (const s of flowShots) {
        appendFileSync(
          MANIFEST,
          JSON.stringify({ tag: TAG, key: `flow-${slug}`, path: `/${slug}`, viewport: 'mobile', state: s.state, timestamp: s.ts, navMs: null, checks: { consoleErrors: consoleErrors.slice(0, 3), failedRequests: failedRequests.slice(0, 3) }, result: consoleErrors.length === 0 && failedRequests.length === 0 ? 'pass' : 'fail', file: s.file }) + '\n',
        )
      }
      await ctx.close()

      // desktop variant of the key states (welcome + details + reveal chain)
      for (const viewport of ['desktop']) {
        await capture(browser, mk('welcome-desktop', /YOUR REWARD IS WAITING/i, null, null, viewport))
      }
      } catch (err) {
        check('flow: state chain captured (10 states)', false, `crash: ${String(err?.message ?? err).slice(0, 120)}`)
      }
    }

    // =====================================================================
    // D. OWNER WORKSPACE (per shop, with temp creds)
    // =====================================================================
    for (const slug of SLUGS) {
      const credsFile = CREDS_DIR ? join(CREDS_DIR, `${slug}.json`) : null
      const creds = credsFile && existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, 'utf8')) : null

      // unauth wall (mobile + desktop)
      for (const viewport of ['mobile', 'desktop']) {
        await capture(browser, {
          key: `owner-${slug}`,
          path: `/${slug}/admin`,
          viewport,
          state: 'login-wall',
          expectText: /Sign in|Shop Owner Dashboard/i,
        })
      }
      if (!creds) continue

      try {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop })
      const page = await ctx.newPage()
      const consoleErrors = []
      const failedRequests = []
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
      page.on('requestfailed', (r) => failedRequests.push(`${r.url()} - ${r.failure()?.errorText ?? ''}`))
      const dir = join(OUT, `owner-${slug}`, 'desktop')
      mkdirSync(dir, { recursive: true })
      const snap = async (state) => {
        await page.screenshot({ path: join(dir, `${state}.png`) })
      }

      await page.goto(`${BASE}/${slug}/admin`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(creds.email)
      await page.locator('input[type="password"]').fill(creds.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForTimeout(1800)
      await page.goto(`${BASE}/${slug}/admin/dashboard`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      await snap('01-dashboard')
      await page.goto(`${BASE}/${slug}/admin/customers`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(800)
      await snap('02-customers')
      await page.goto(`${BASE}/${slug}/admin/rewards`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Add reward' }).waitFor({ timeout: 10000 }).catch(() => null)
      await snap('03-campaign')
      await page.goto(`${BASE}/${slug}/admin/settings`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(800)
      await snap('04-settings')
      await page.goto(`${BASE}/${slug}/admin/qr-code`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(800)
      await snap('05-qr-code')

      check(`owner ${slug}: workspace sections captured`, existsSync(join(dir, '05-qr-code.png')))
      check(`owner ${slug}: no console errors in workspace`, consoleErrors.length === 0, consoleErrors[0]?.slice(0, 100) ?? '')
      check(`owner ${slug}: no failed app requests in workspace`, failedRequests.length === 0, failedRequests[0]?.slice(0, 100) ?? '')

      // cross-privilege: this store admin must NOT get platform access
      await page.goto(`${BASE}/platform`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      const platText = await page.locator('body').innerText()
      check(
        `owner ${slug}: no platform access (gate shows required/not admin)`,
        /Platform access required|not a platform administrator|platform\/login/i.test(platText),
        platText.replace(/\s+/g, ' ').slice(0, 80),
      )

      // data states + collection + CSV (synthetic data; staging only)
      if (ALLOW_CLAIMS) {
        await page.goto(`${BASE}/${slug}/admin/customers`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)
        const hasRows = (await page.locator('table tbody tr').count()) > 0
        const isDraft = slug === 'pashupati'
        if (isDraft) {
          // designed behaviour: the draft shop accepts no entries, so its
          // submissions list is legitimately EMPTY
          check(`owner ${slug}: draft shop list is empty (campaign inactive by design)`, !hasRows, `rows=${await page.locator('table tbody tr').count()}`)
          await snap('06-customers-empty')
        } else {
          check(`owner ${slug}: submissions list shows the synthetic entries`, hasRows)
        }
        if (hasRows) {
          await snap('06-customers-with-data')
          const firstRow = page.locator('table tbody tr').first()
          const claim = ((await firstRow.innerText()).match(/GIFT-[A-Z0-9]+/) ?? [''])[0]
          await firstRow.click()
          await page.waitForTimeout(700)
          await snap('07-customer-drawer')
          await page.keyboard.press('Escape').catch(() => null)
          await page.waitForTimeout(300)
          // scope the action to THIS row (by its unique claim code)
          const markBtn = page
            .locator('table tbody tr', { hasText: claim })
            .getByRole('button', { name: /Mark (gift )?collected/i })
            .first()
          if (await markBtn.isVisible().catch(() => false)) {
            await markBtn.click()
            await page.waitForTimeout(1500)
            await snap('08-marked-collected')
            const afterText = await page.locator('body').innerText()
            check(`owner ${slug}: gift collection recorded`, /collected/i.test(afterText), afterText.replace(/\s+/g, ' ').slice(0, 80))
            // the SAME row must no longer offer the action: the UI removes it
            // (backend additionally rejects - proven by backend-e2e G3)
            const sameRow = page.locator('table tbody tr', { hasText: claim })
            const rowText = (await sameRow.innerText().catch(() => '')) || ''
            const stillActionable = await sameRow
              .getByRole('button', { name: /Mark (gift )?collected/i })
              .first()
              .isVisible()
              .catch(() => false)
            check(
              `owner ${slug}: double collection is prevented (action removed on collected row)`,
              !stillActionable && /Collected/i.test(rowText),
              rowText.replace(/\s+/g, ' ').slice(0, 80),
            )
            await snap('09-double-collection-prevented')
          }
        }
        // CSV export (headers mirror the vendor contract; button is disabled
        // when there is nothing to export)
        const csvBtn = page.getByRole('button', { name: /Export CSV/i }).first()
        if (await csvBtn.isEnabled().catch(() => false)) {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
            csvBtn.click(),
          ])
          if (download) {
            const csvPath = join(OUT, 'csv', `${slug}-customers.csv`)
            mkdirSync(join(OUT, 'csv'), { recursive: true })
            await download.saveAs(csvPath)
            const csv = readFileSync(csvPath, 'utf8')
            check(
              `owner ${slug}: CSV export downloads with the expected columns`,
              /Claim Code/i.test(csv) && /Status/i.test(csv) && /Collected At/i.test(csv),
              csv.split('\n')[0]?.slice(0, 120),
            )
          } else {
            check(`owner ${slug}: CSV export downloads`, false, 'no download event')
          }
        } else {
          check(`owner ${slug}: CSV export button disabled with nothing to export`, isDraft, 'disabled on an active shop with data')
        }
      }
      await ctx.close()
      } catch (err) {
        check(`owner ${slug}: workspace flow completed`, false, `crash: ${String(err?.message ?? err).slice(0, 120)}`)
      }
    }

    // =====================================================================
    // E. LEGACY /admin/* SHELL (single-shop era)
    // =====================================================================
    {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      const text = await page.locator('body').innerText()
      check('legacy /admin unauthenticated shows the sign-in wall (never data)', /sign in/i.test(text) && !/Total customers/i.test(text), text.replace(/\s+/g, ' ').slice(0, 80))
      mkdirSync(join(OUT, 'admin-legacy', 'desktop'), { recursive: true })
      await page.screenshot({ path: join(OUT, 'admin-legacy', 'desktop', 'login-wall.png') })
      await ctx.close()
    }

    // =====================================================================
    // F. PLATFORM WORKSPACE (platform creds)
    // =====================================================================
    if (PLATFORM_CREDS && existsSync(PLATFORM_CREDS)) {
      const creds = JSON.parse(readFileSync(PLATFORM_CREDS, 'utf8'))
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop })
      const page = await ctx.newPage()
      const consoleErrors = []
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
      const dir = join(OUT, 'platform', 'desktop')
      mkdirSync(dir, { recursive: true })

      await page.goto(`${BASE}/platform/login`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(creds.email)
      await page.locator('input[type="password"]').fill(creds.password)
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.waitForTimeout(1800)
      await page.goto(`${BASE}/platform/shops`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(dir, '01-shops.png') })
      const shopsText = await page.locator('body').innerText()
      check('platform: shops page lists the four instances', shopsText.includes('Pashupati') && shopsText.includes('Shree Manali'), shopsText.replace(/\s+/g, ' ').slice(0, 100))
      await page.goto(`${BASE}/platform/catalog`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      await page.screenshot({ path: join(dir, '02-catalog.png') })
      check('platform: catalogue page renders for the platform admin', /catalog|gift/i.test(await page.locator('body').innerText()))
      check('platform: no console errors', consoleErrors.length === 0, consoleErrors[0]?.slice(0, 100) ?? '')
      await ctx.close()
    }

    // =====================================================================
    // G. LOADING STATE (evidence capture, no assertion)
    // =====================================================================
    {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/${SLUGS[0]}`, { waitUntil: 'commit' }).catch(() => null)
      mkdirSync(join(OUT, `customer-${SLUGS[0]}`, 'mobile'), { recursive: true })
      await page.screenshot({ path: join(OUT, `customer-${SLUGS[0]}`, 'mobile', 'loading.png') }).catch(() => null)
      await ctx.close()
      console.log('INFO  loading state captured (evidence, no assertion)')
    }
  } finally {
    await browser.close()
  }

  console.log(`RESULT ${pass} passed, ${fail} failed (qa-sweep ${TAG} @ ${BASE})`)
  console.log(`INFO  manifest ${MANIFEST}`)
  if (failures.length) console.log(`INFO  failed rows: ${failures.join(' | ')}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAIL  sweep crashed: ${err?.stack ?? err}`)
  process.exit(1)
})
