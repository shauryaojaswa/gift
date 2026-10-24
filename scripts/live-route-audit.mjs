#!/usr/bin/env node
/**
 * LIVE route + authentication surface audit (read-mostly, production).
 *
 * Covers what the existing suites do not:
 *   - the complete route inventory actually served (status, redirect chain,
 *     SPA fallback behaviour, designed 404),
 *   - authentication edge cases (empty/malformed submit, wrong password,
 *     session persistence across reload, logout invalidation),
 *   - protected-route enforcement and the cross-tenant 403 wall in the UI,
 *   - per-store branding (the admin sign-in screen and the admin badge),
 *   - console errors and failed network requests on every page visited.
 *
 * Writes: <out>/route-audit.json  and  <out>/route-audit.md
 * Usage: node scripts/live-route-audit.mjs [--out <dir>] [--screenshots]
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const OUT = arg('--out', join(tmpdir(), 'opencode', 'audit-route'))
const SHOTS = argv.includes('--screenshots')
const ORIGIN = arg('--origin', 'https://jriq.in')
mkdirSync(OUT, { recursive: true })

const credsFile = join(tmpdir(), 'jriq-pashupati-owner-credentials.json')
const CREDS = JSON.parse(readFileSync(credsFile, 'utf8'))
const PW = CREDS.pashupati1.password

const results = []
let n = 0
const record = (name, route, expected, actual, status, severity = 'info', evidence = '') => {
  results.push({
    id: `RA-${String(++n).padStart(3, '0')}`,
    name,
    route,
    expected,
    actual,
    status,
    severity,
    evidence,
    ts: new Date().toISOString(),
  })
  const tag = status === 'PASS' ? 'PASS ' : status === 'BLOCKED' ? 'BLOCK' : 'FAIL '
  console.log(`${tag} ${results[results.length - 1].id} ${name}${status !== 'PASS' ? ' :: ' + actual : ''}`)
}

const browser = await chromium.launch({ headless: true })

/** Visit a page, collect console errors + failed requests, return a summary. */
async function visit(ctx, path, { expectText = null, expectStatus = 200, name = null } = {}) {
  const page = await ctx.newPage()
  const consoleErrors = []
  const failed = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200)))
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 120)}`)
  })
  page.on('requestfailed', (r) => failed.push(`FAILED ${r.url().slice(0, 120)}`))
  const res = await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  const status = res ? res.status() : 0
  const ok = status === expectStatus && (!expectText || text.includes(expectText))
  record(
    name ?? `page ${path}`,
    path,
    expectText ? `HTTP ${expectStatus} and text "${expectText}"` : `HTTP ${expectStatus}`,
    ok
      ? `HTTP ${status}`
      : `HTTP ${status}${expectText && !text.includes(expectText) ? ` (missing text "${expectText}")` : ''}`,
    ok ? 'PASS' : 'FAIL',
    ok ? 'info' : 'high',
    `console errors: ${consoleErrors.length}${consoleErrors.length ? ' | ' + consoleErrors.slice(0, 2).join(' ; ') : ''}${failed.length ? ' | failed requests: ' + failed.slice(0, 3).join(' ; ') : ''}`,
  )
  if (SHOTS) await page.screenshot({ path: join(OUT, `page${path.replace(/\//g, '_')}.png`), fullPage: true }).catch(() => {})
  await page.close()
  return { status, text, consoleErrors, failed }
}

// ---------------------------------------------------------------- route sweep
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } })
const ROUTES = [
  ['/', 'JRIQ', 200],
  ['/privacy', null, 200],
  ['/pashupati1', 'YOUR REWARD IS WAITING', 200],
  ['/pashupati2', 'LOHTA', 200],
  ['/pashupati', null, 200],
  ['/bcy', 'BCY Jewellers Private Limited', 200],
  ['/jolly-enterprises', null, 200],
  ['/shreejwellers', null, 200],
  ['/shreemanali', null, 200],
  ['/standee/pashupati1', 'SCAN', 200],
  ['/standee/bcy', 'SCAN', 200],
  ['/platform/login', null, 200],
  ['/admin/login', null, 200],
  ['/vendor/login', 'Sign in', 200],
  ['/definitely-not-a-shop-xyz', null, 200], // designed 404 page (SPA)
]
for (const [path, text, status] of ROUTES) {
  await visit(ctx, path, { expectText: text, expectStatus: status })
}

// console-error free check for the key pages
{
  const page = await ctx.newPage()
  const errs = []
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)))
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 160)))
  for (const p of ['/', '/pashupati1', '/vendor/login']) {
    await page.goto(ORIGIN + p, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  }
  record('no console errors on home / storefront / sign-in', '/, /pashupati1, /vendor/login', 'zero console errors', `${errs.length} error(s): ${errs.slice(0, 2).join(' ; ')}`, errs.length === 0 ? 'PASS' : 'FAIL', errs.length === 0 ? 'info' : 'medium')
  await page.close()
}

// legacy redirect + protected-route enforcement
{
  const page = await ctx.newPage()
  const res = await page.goto(ORIGIN + '/store/pashupati1', { waitUntil: 'domcontentloaded' })
  const finalUrl = page.url()
  record('legacy /store/{slug} resolves to the shop URL', '/store/pashupati1', 'lands on /pashupati1', `${res.status()} -> ${finalUrl}`, finalUrl.includes('/pashupati1') ? 'PASS' : 'FAIL', 'medium')
  await page.goto(ORIGIN + '/pashupati1/admin/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  record('protected admin route without a session lands on sign-in', '/pashupati1/admin/dashboard', 'redirected to the sign-in screen', page.url().includes('/vendor/login') ? 'redirected to /vendor/login' : `still at ${page.url()}`, page.url().includes('/vendor/login') ? 'PASS' : 'FAIL', 'high')
  record('sign-in screen shows the sign-in form', '/vendor/login', 'a sign-in form is rendered', t.includes('Sign in') ? 'form present' : t.slice(0, 80), t.includes('Sign in') ? 'PASS' : 'FAIL', 'high')
  await page.close()
}

// ------------------------------------------------------------- auth behaviour
{
  const page = await ctx.newPage()
  await page.goto(ORIGIN + '/pashupati1/admin', { waitUntil: 'domcontentloaded' })
  await page.locator('input[autocomplete="username"], input[type="email"]').first().waitFor({ state: 'visible', timeout: 20000 })

  // empty submit must be blocked by the browser (required fields)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(800)
  const stillOnForm = page.url().includes('/vendor/login')
  const userVal = await page.locator('input[autocomplete="username"], input[type="email"]').first().inputValue()
  record('empty sign-in submit is refused (no session, no navigation)', '/vendor/login', 'stays on the form, no session', stillOnForm && userVal === '' ? 'still on the form, field empty' : `url=${page.url()} value="${userVal}"`, stillOnForm && userVal === '' ? 'PASS' : 'FAIL', 'medium')

  // wrong password
  await page.locator('input[autocomplete="username"], input[type="email"]').first().fill('Pashupati1')
  await page.locator('input[type="password"]').first().fill('wrong-password-probe')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(2500)
  const errText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  const refused = errText.includes('Invalid') || errText.includes('invalid') || errText.includes('Unable') || errText.includes('Error')
  record('wrong password is refused with a visible error', '/vendor/login', 'an error is shown, no session', refused ? `error shown: "${(errText.match(/(Invalid|Unable|Error)[^|]{0,60}/) || [''])[0]}"` : errText.slice(0, 90), refused ? 'PASS' : 'FAIL', 'high')

  // valid login
  await page.locator('input[autocomplete="username"], input[type="email"]').first().fill('Pashupati1')
  await page.locator('input[type="password"]').first().fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('nav[aria-label="Vendor navigation"]', { timeout: 25000 })
  record('valid sign-in (login ID) reaches the store dashboard', '/pashupati1/admin', 'admin workspace with the vendor nav', `url=${page.url()}`, page.url().includes('/pashupati1/admin') ? 'PASS' : 'FAIL', 'high')

  // session persistence across reload
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const navAfter = await page.locator('nav[aria-label="Vendor navigation"]').count()
  record('session survives a hard reload', '/pashupati1/admin/dashboard', 'still signed in', navAfter > 0 ? 'still signed in' : 'session lost', navAfter > 0 ? 'PASS' : 'FAIL', 'high')

  // cross-tenant wall in the UI
  await page.goto(ORIGIN + '/pashupati2/admin/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const wall = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  const blocked = wall.includes('403') || wall.includes('another shop')
  record('cross-tenant admin URL shows the 403 wall (no other shop data)', '/pashupati2/admin/dashboard', '403 wall, no data of the other shop', blocked ? '403 wall shown' : wall.slice(0, 110), blocked ? 'PASS' : 'FAIL', 'high')
  const leaked = /Total customers|claim code|Claim code/.test(wall)
  record('cross-tenant wall leaks no other-shop metrics', '/pashupati2/admin/dashboard', 'no customer counters on the wall', leaked ? 'metrics visible on the wall' : 'no metrics on the wall', leaked ? 'FAIL' : 'PASS', 'high')

  // per-store branding on the admin surfaces (back on the signed-in store)
  await page.goto(ORIGIN + '/pashupati1/admin/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const dashText = await page.evaluate(() => document.body.innerText)
  record('admin badge shows the branch label of the signed-in store', '/pashupati1/admin/dashboard', 'the branch label (Vijaya Road) is visible in the admin', /vijaya road/i.test(dashText) ? 'branch label visible' : 'branch label missing', /vijaya road/i.test(dashText) ? 'PASS' : 'FAIL', 'medium')

  // logout invalidates the session
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForTimeout(2500)
  const afterLogout = page.url()
  await page.goto(ORIGIN + '/pashupati1/admin/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const gated = page.url().includes('/vendor/login')
  record('sign-out invalidates the session (protected route gated again)', '/pashupati1/admin/dashboard', 'redirected to sign-in after sign-out', `after logout url=${afterLogout}; revisit -> ${page.url()}`, gated ? 'PASS' : 'FAIL', 'high')
  await page.close()
}

// ------------------------------------------- branded sign-in per store URL
for (const [slug, expect] of [
  ['pashupati1', 'Vijaya Road'],
  ['pashupati2', 'Lohta'],
  ['pashupati', 'Godowlia'],
  ['bcy', 'BCY Jewellers Private Limited'],
]) {
  const page = await ctx.newPage()
  await page.goto(`${ORIGIN}/${slug}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  const ok = t.toLowerCase().includes(expect.toLowerCase())
  record(`admin sign-in screen is branded for ${slug}`, `/${slug}/admin`, `shows "${expect}"`, ok ? `shows "${expect}"` : t.slice(0, 110), ok ? 'PASS' : 'FAIL', 'medium')
  if (SHOTS) await page.screenshot({ path: join(OUT, `login-${slug}.png`), fullPage: true }).catch(() => {})
  await page.close()
}

await ctx.close()
await browser.close()

// ------------------------------------------------------------------- output
const pass = results.filter((r) => r.status === 'PASS').length
const fail = results.filter((r) => r.status === 'FAIL').length
writeFileSync(join(OUT, 'route-audit.json'), JSON.stringify({ origin: ORIGIN, when: new Date().toISOString(), pass, fail, results }, null, 2))
const md = [
  `# Live route + auth surface audit - ${ORIGIN}`,
  ``,
  `Run: ${new Date().toISOString()} | PASS ${pass} / FAIL ${fail}`,
  ``,
  `| ID | Check | Route | Expected | Actual | Status | Severity |`,
  `|---|---|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.name} | ${r.route} | ${r.expected} | ${String(r.actual).slice(0, 120)} | ${r.status} | ${r.severity} |`),
  ``,
].join('\n')
writeFileSync(join(OUT, 'route-audit.md'), md)
console.log(`\nRESULT ${pass} passed, ${fail} failed -> ${join(OUT, 'route-audit.md')}`)
process.exit(fail === 0 ? 0 : 1)
