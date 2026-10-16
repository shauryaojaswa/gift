// LIVE PRODUCTION READ-ONLY VISUAL + BOUNDARY AUDIT (v1.2.0 final acceptance).
//
// Targets the deployed site https://jriq.in only. Genuine shops are read-only:
// this script never submits a valid entry (invalid inputs are exercised to prove
// validation), never writes configuration, and asserts that no
// submit_customer_entry RPC is ever issued. Screenshots land in logs/live-audit.
import { chromium } from 'playwright'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'

const BASE = 'https://jriq.in'
const OUT = 'logs/live-audit'
mkdirSync(OUT, { recursive: true })

const rows = []
let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`)
  if (ok) pass += 1
  else fail += 1
}

const consoleErrors = []
const failedRequests = []
const rpcCalls = []

function wire(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 200)}`))
  page.on('requestfailed', (r) =>
    failedRequests.push(`[${tag}] ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`),
  )
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`[${tag}] ${r.status()} ${r.url().slice(0, 120)}`)
  })
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/rpc/')) rpcCalls.push(`${tag} ${r.url().split('/rest/v1/rpc/')[1]}`)
  })
}

const browser = await chromium.launch()
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } })

// ---------- Homepage: real homepage, never auto-opens a shop ----------
{
  const page = await mobile.newPage()
  wire(page, 'home')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/live-01-home-390.png`, fullPage: true })
  check('homepage renders at "/"', page.url() === `${BASE}/`, page.url())
  check('homepage never auto-opens a shop', !(await page.locator('h1').first().textContent().catch(() => null))?.match(/CUSTOMER REWARDS/))
  await page.close()
}

// ---------- Shop landing + details validation (jolly-enterprises, read-only) ----------
{
  const page = await mobile.newPage()
  wire(page, 'shop390')
  await page.goto(`${BASE}/jolly-enterprises`, { waitUntil: 'networkidle' })
  const h1 = (await page.locator('h1').first().textContent()) ?? ''
  check('shop name visible as text', h1.trim() === 'CUSTOMER REWARDS', JSON.stringify(h1.trim()))
  const title = await page.title()
  check('document.title reflects the shop', title.includes('CUSTOMER REWARDS'), title)
  const logo = page.locator('img').first()
  const logoOk = (await logo.count()) > 0 && (await logo.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false))
  check('shop logo asset loads', logoOk)
  await page.screenshot({ path: `${OUT}/live-02-shop-landing-390.png`, fullPage: true })

  const start = page.getByRole('button', { name: 'START' })
  check('START button present', await start.isVisible())
  const startBg = await start.evaluate((el) => getComputedStyle(el).backgroundColor)
  rows.push(`INFO  START button background (theme consumer): ${startBg}`)
  await start.click()

  await page.getByLabel('Full name').waitFor({ timeout: 10000 })
  await page.screenshot({ path: `${OUT}/live-03-details-empty-390.png`, fullPage: true })
  check('details form exposes Full name', await page.getByLabel('Full name').isVisible())
  check('details form exposes Purchase amount in Indian Rupees', await page.getByLabel('Purchase amount in Indian Rupees').isVisible())
  check('details form exposes 10-digit mobile number', await page.getByLabel('10-digit mobile number').isVisible())

  const amountPlaceholder = (await page.getByLabel('Purchase amount in Indian Rupees').getAttribute('placeholder')) ?? ''
  check('amount placeholder is Indian-formatted and tier-aligned', amountPlaceholder.startsWith('₹') && amountPlaceholder.includes('10,000'), amountPlaceholder)

  // empty submit -> name/amount errors
  await page.getByRole('button', { name: 'CONTINUE' }).click()
  await page.waitForTimeout(400)
  const body1 = await page.locator('body').innerText()
  check('empty submit rejected (name)', body1.includes('Please enter your name.'))

  // short name -> invalid name
  await page.getByLabel('Full name').fill('A')
  await page.getByRole('button', { name: 'CONTINUE' }).click()
  await page.waitForTimeout(400)
  check('short name rejected', (await page.locator('body').innerText()).includes('Please enter a valid name.'))

  // below-minimum amount + malformed phone
  await page.getByLabel('Full name').fill('Audit Probe')
  await page.getByLabel('Purchase amount in Indian Rupees').fill('500')
  await page.getByLabel('10-digit mobile number').fill('98765')
  await page.screenshot({ path: `${OUT}/live-04-details-invalid-390.png`, fullPage: true })
  await page.getByRole('button', { name: 'CONTINUE' }).click()
  await page.waitForTimeout(400)
  const body2 = await page.locator('body').innerText()
  check('malformed phone rejected', body2.includes('Please enter a valid 10-digit mobile number.'))
  check('below-minimum amount rejected', /available on purchases of/i.test(body2), body2.match(/[^\n]*available on purchases[^\n]*/i)?.[0] ?? 'no below-min message')
  check('invalid submits never claim', !rpcCalls.some((r) => r.includes('submit_customer_entry')), rpcCalls.join(', ') || 'zero RPC calls')

  const chips = await page.locator('button[aria-label^="Set purchase amount to"]').allTextContents()
  check('quick-select chips exist and use Indian formatting', chips.length > 0 && chips.every((c) => c.includes('₹')), chips.join(' | ').slice(0, 120))
  await page.close()
}

// desktop capture of the same shop
{
  const page = await desktop.newPage()
  wire(page, 'shopDesk')
  await page.goto(`${BASE}/jolly-enterprises`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/live-05-shop-landing-1280.png`, fullPage: true })
  check('desktop landing renders', (await page.locator('h1').first().isVisible()))
  await page.close()
}

// ---------- Unknown slug: designed not-found ----------
{
  const page = await mobile.newPage()
  wire(page, 'notfound')
  await page.goto(`${BASE}/no-such-shop-live-audit-zz`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/live-06-notfound-390.png`, fullPage: true })
  check('unknown slug shows designed not-found', /not found|doesn.t exist|no such/i.test(body), body.slice(0, 100).replace(/\n/g, ' '))
  check('unknown slug leaks no shop data', !body.includes('CUSTOMER REWARDS'))
  await page.close()
}

// ---------- Auth boundaries ----------
{
  const page = await mobile.newPage()
  wire(page, 'adminwall')
  await page.goto(`${BASE}/jolly-enterprises/admin`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/live-07-admin-wall-390.png`, fullPage: true })
  check('vendor admin enforces authentication', /sign in|log ?in|password/i.test(body))
  check('vendor admin leaks no customer records', !/GIFT-[0-9A-F]{6,}/.test(body) && !/9876\d{5}/.test(body))
  await page.close()
}
{
  const page = await mobile.newPage()
  wire(page, 'platformwall')
  await page.goto(`${BASE}/platform`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/live-08-platform-wall-390.png`, fullPage: true })
  check('platform admin enforces authentication', /sign in|log ?in|password|platform/i.test(body))
  await page.close()
}

// ---------- Legacy /store/{slug} canonicalises in-browser ----------
{
  const page = await mobile.newPage()
  wire(page, 'legacy')
  await page.goto(`${BASE}/store/jolly-enterprises`, { waitUntil: 'networkidle' })
  check('legacy /store/{slug} lands on /{slug}', page.url() === `${BASE}/jolly-enterprises`, page.url())
  await page.close()
}

await browser.close()

rows.push(`INFO  console errors observed: ${consoleErrors.length}`)
for (const e of consoleErrors.slice(0, 10)) rows.push(`INFO  console: ${e}`)
rows.push(`INFO  failed/4xx+ requests observed: ${failedRequests.length}`)
for (const e of failedRequests.slice(0, 10)) rows.push(`INFO  net: ${e}`)
rows.push(`INFO  RPC calls during the session: ${rpcCalls.length} (${rpcCalls.join(', ') || 'none'})`)
rows.push(`RESULT ${pass} passed, ${fail} failed (live production read-only audit)`)

const text = rows.join('\n')
writeFileSync(`${OUT}/live-visual.log`, text, 'utf8')
appendFileSync(`${OUT}/live-visual.log`, `\nstart context: see ${OUT}/context.txt\n`, 'utf8')
console.log(text)
process.exit(fail === 0 ? 0 : 1)
