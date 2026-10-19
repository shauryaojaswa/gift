#!/usr/bin/env node
// Owner logo uploader rehearsal - drives the REAL Store Settings upload flow
// in Chromium as a shop-owner session, exactly as an authorised owner of a
// future shop would: upload a logo, replace it, and see it live on the
// customer page. Proves the reusable in-app uploader works independently of
// any operator tooling.
//
// Run against a rehearsal build or a live host. Intended for STAGING.
//
// Usage:
//   node scripts/logo-ui-rehearsal.mjs --base http://localhost:4173 --slug shreejwellers
//        --email <owner-email> --password <owner-password> --file <image>
//        [--out logs/logo-verify-staging]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

const BASE = (argValue('--base') ?? 'http://localhost:4173').replace(/\/$/, '')
const SLUG = argValue('--slug')
const EMAIL = argValue('--email')
const PASSWORD = argValue('--password')
const FILE = argValue('--file')
const OUT = argValue('--out') ?? 'logs/logo-verify-staging'

if (!SLUG || !EMAIL || !PASSWORD || !FILE) {
  console.error('Usage: node scripts/logo-ui-rehearsal.mjs --base <url> --slug <slug> --email <email> --password <pw> --file <image>')
  process.exit(2)
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`
  console.log(line)
  if (ok) pass += 1
  else fail += 1
}

async function previewSrc(page) {
  return page.evaluate(() => {
    const img = document.querySelector('img[alt="Store logo preview"]')
    if (!img) return null
    return {
      src: img.currentSrc || img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      objectFit: getComputedStyle(img).objectFit,
    }
  })
}

async function uploadLogo(page, file, label) {
  await page.setInputFiles('#logo-upload', file)
  await page
    .locator('text=Logo uploaded.')
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => null)
  const message = await page.locator('text=/Logo (uploaded|upload)/').first().textContent().catch(() => null)
  check(`${label}: uploader reports success`, message === 'Logo uploaded.', String(message))
  await page
    .waitForFunction(() => {
      const img = document.querySelector('img[alt="Store logo preview"]')
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }, { timeout: 20000 })
    .catch(() => null)
  return previewSrc(page)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const consoleErrors = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
    })

    // 1. owner sign-in at the stable login URL (the /{slug}/admin wall
    //    redirects there and the form remounts mid-fill, so sign in first)
    await page.goto(`${BASE}/vendor/login`, { waitUntil: 'load' })
    await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(700)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    let signedIn = false
    for (let t = 0; t < 12 && !signedIn; t += 1) {
      await page.waitForTimeout(1000)
      signedIn = !page.url().includes('/vendor/login')
    }
    check('owner sign-in through the workspace login wall', signedIn, page.url())

    // 2. Store Settings
    await page.goto(`${BASE}/${SLUG}/admin/settings`, { waitUntil: 'load' })
    await page.locator('img[alt="Store logo preview"]').first().waitFor({ state: 'visible', timeout: 20000 })
    const before = await previewSrc(page)
    check('current logo preview visible before upload', Boolean(before?.src), JSON.stringify(before ?? null))
    await page.screenshot({ path: join(OUT, 'logo-ui-1-before.png'), fullPage: true })

    // 3. upload through the in-app uploader
    const afterUpload = await uploadLogo(page, FILE, 'upload #1 (owner UI)')
    check('upload #1 shows the new logo in the preview', afterUpload?.src !== before?.src, String(afterUpload?.src))
    check('upload #1 image decoded', afterUpload?.complete && afterUpload.naturalWidth > 0, `${afterUpload?.naturalWidth}x${afterUpload?.naturalHeight}`)
    check('upload #1 preview uses object-fit: contain', afterUpload?.objectFit === 'contain', String(afterUpload?.objectFit))
    await page.screenshot({ path: join(OUT, 'logo-ui-2-after-upload.png'), fullPage: true })

    // 4. persistence: a full reload must still show the uploaded logo
    await page.reload({ waitUntil: 'load' })
    await page.locator('img[alt="Store logo preview"]').first().waitFor({ state: 'visible', timeout: 20000 })
    const afterReload = await previewSrc(page)
    check('uploaded logo persists across a reload (saved settings)', afterReload?.src === afterUpload?.src, String(afterReload?.src))
    await page.screenshot({ path: join(OUT, 'logo-ui-3-after-reload.png'), fullPage: true })

    // 5. replace: uploading again supersedes the previous logo
    const afterReplace = await uploadLogo(page, FILE, 'upload #2 (replace)')
    check('replace supersedes the previous logo URL', afterReplace?.src !== afterUpload?.src, String(afterReplace?.src))
    await page.screenshot({ path: join(OUT, 'logo-ui-4-after-replace.png'), fullPage: true })

    await page.reload({ waitUntil: 'load' })
    await page.locator('img[alt="Store logo preview"]').first().waitFor({ state: 'visible', timeout: 20000 })
    const afterReplaceReload = await previewSrc(page)
    check('replaced logo persists across a reload', afterReplaceReload?.src === afterReplace?.src, String(afterReplaceReload?.src))

    // 6. the customer page shows the owner's latest logo
    await page.goto(`${BASE}/${SLUG}?uiRehearsal=${Date.now()}`, { waitUntil: 'load' })
    await page.locator('img.store-logo-image').first().waitFor({ state: 'visible', timeout: 20000 })
    const customer = await page.evaluate(() => {
      const img = document.querySelector('img.store-logo-image')
      return img ? { src: img.currentSrc || img.src, naturalWidth: img.naturalWidth, objectFit: getComputedStyle(img).objectFit } : null
    })
    check('customer page shows the owner-uploaded logo', customer?.src === afterReplace?.src, String(customer?.src))
    check('customer page logo decoded + object-fit: contain', customer?.naturalWidth > 0 && customer?.objectFit === 'contain', JSON.stringify(customer ?? null))
    await page.screenshot({ path: join(OUT, 'logo-ui-5-customer-page.png'), fullPage: true })

    check('no console errors during the owner upload workflow', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
  } finally {
    await browser.close()
  }
  console.log(`RESULT ${pass} passed, ${fail} failed (owner logo UI rehearsal on ${BASE})`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL  rehearsal aborted - ${err?.message ?? err}`)
  process.exit(1)
})
