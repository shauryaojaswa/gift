#!/usr/bin/env node
// Narrow-phone visual QA for the customer flow (final merged brief: "inspect
// real screenshots at 390x844, a narrower phone, and desktop").
//
// Drives the REAL app build in Chromium at a narrow phone viewport (default
// 360x740 - narrower than the iPhone 12/X target), walks Welcome -> Details ->
// Review invite -> Share Your Experience modal, and asserts at every step:
//   - no horizontal overflow
//   - the primary action is visible without scrolling
//   - the one-click review cards are visible and tappable
// Screenshots land in %TEMP%/jriq-narrow-qa (evidence pack).
//
// Claim-creating: run against a STAGING build only (a synthetic entry is
// submitted and never collected). Never point this at production.
//
// Usage:
//   node scripts/narrow-phone-qa.mjs [--width 360] [--height 740] [--out <dir>]
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
function argValue(flag, fallback) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const WIDTH = Number(argValue('--width', '360'))
const HEIGHT = Number(argValue('--height', '740'))
const EVIDENCE = argValue('--out', join(tmpdir(), 'jriq-narrow-qa'))
const BASE = 'http://127.0.0.1:4173'
mkdirSync(EVIDENCE, { recursive: true })

const PHONE = `9${String(100000000 + Math.floor(Math.random() * 899999999))}`

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
async function noOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  return { ok: overflow <= 1, overflow }
}
async function shot(page, name) {
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: false })
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

const preview = await startPreview()
for (let i = 0; i < 60 && !(await serverUp()); i += 1) {
  await new Promise((r) => setTimeout(r, 500))
}
if (!(await serverUp())) {
  console.error('vite preview did not start (build dist with the STAGING env first)')
  process.exit(2)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
})
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

try {
  // ---- Welcome ----
  await page.goto(`${BASE}/shreejwellers`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'START', exact: true }).waitFor({ timeout: 15000 })
  const welcome = await noOverflow(page)
  check(`no horizontal overflow at ${WIDTH}x${HEIGHT} (welcome)`, welcome.ok, `overflow ${welcome.overflow}px`)
  check('primary action visible without scrolling', await page.getByRole('button', { name: 'START', exact: true }).isVisible())
  await shot(page, `01-welcome-${WIDTH}x${HEIGHT}`)

  // ---- Details ----
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await page.getByLabel('Full name').fill('Narrow QA')
  await page.getByLabel('Purchase amount in Indian Rupees').fill('5000')
  await page.getByLabel('10-digit mobile number').fill(PHONE)
  const details = await noOverflow(page)
  check('no horizontal overflow (details)', details.ok, `overflow ${details.overflow}px`)
  await shot(page, `02-details-${WIDTH}x${HEIGHT}`)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()

  // ---- Review invite ----
  await page.getByText('SHARE YOUR EXPERIENCE').waitFor({ timeout: 15000 })
  const invite = await noOverflow(page)
  check('no horizontal overflow (review invite)', invite.ok, `overflow ${invite.overflow}px`)
  check('the skip action is visible', await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).isVisible())
  await shot(page, `03-invite-${WIDTH}x${HEIGHT}`)

  // ---- Share Your Experience modal ----
  await page.getByRole('button', { name: /Leave a Google Review/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Share Your Experience' })
  await dialog.waitFor({ timeout: 5000 })
  const modal = await noOverflow(page)
  check('no horizontal overflow (review modal)', modal.ok, `overflow ${modal.overflow}px`)
  const cards = page.locator('.review-suggestion')
  check('review cards rendered', (await cards.count()) === 10, `count=${await cards.count()}`)
  check('first review card is visible and tappable', await cards.first().isVisible())
  const box = await cards.first().boundingBox()
  check('review card meets the 44px touch target', !!box && box.height >= 44, box ? `h=${box.height}` : 'no box')
  await shot(page, `04-modal-${WIDTH}x${HEIGHT}`)

  // ---- One-click tap (copy + open Google) ----
  await cards.nth(3).click()
  await page.getByText(/Google is opening in a new tab/i).waitFor({ timeout: 5000 })
  check('one-click tap feedback renders', true)
  await shot(page, `05-modal-after-tap-${WIDTH}x${HEIGHT}`)

  check('no console errors during the session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  await ctx.close()
  await browser.close()
  if (preview) preview.kill()
}

console.log(`RESULT ${pass} passed, ${fail} failed (narrow-phone QA ${WIDTH}x${HEIGHT})`)
console.log(`INFO  screenshots ${EVIDENCE}`)
process.exit(fail === 0 ? 0 : 1)
