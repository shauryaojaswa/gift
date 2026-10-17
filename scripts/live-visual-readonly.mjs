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
const LOG_PATH = `${OUT}/live-visual.log`
writeFileSync(LOG_PATH, '', 'utf8') // incremental log: rows survive a mid-run crash
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`
  rows.push(line)
  appendFileSync(LOG_PATH, `${line}\n`, 'utf8')
  if (ok) pass += 1
  else fail += 1
}

const consoleErrors = []
const failedRequests = []
const rpcCalls = []

// networkidle can be flaky behind the edge/CDN keep-alives; fall back to load.
async function nav(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  } catch {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  }
}

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
  await nav(page,`${BASE}/`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/live-01-home-390.png`, fullPage: true })
  check('homepage renders at "/"', page.url() === `${BASE}/`, page.url())
  check('homepage never auto-opens a shop', !(await page.locator('h1').first().textContent().catch(() => null))?.match(/CUSTOMER REWARDS/))
  await page.close()
}

// ---------- Shop landing + details validation (jolly-enterprises, read-only) ----------
{
  const page = await mobile.newPage()
  wire(page, 'shop390')
  await nav(page,`${BASE}/jolly-enterprises`, { waitUntil: 'networkidle' })
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
  await nav(page,`${BASE}/jolly-enterprises`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/live-05-shop-landing-1280.png`, fullPage: true })
  check('desktop landing renders', (await page.locator('h1').first().isVisible()))
  await page.close()
}

// ---------- Unknown slug: designed not-found ----------
{
  const page = await mobile.newPage()
  wire(page, 'notfound')
  await nav(page,`${BASE}/no-such-shop-live-audit-zz`, { waitUntil: 'networkidle' })
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
  await nav(page,`${BASE}/jolly-enterprises/admin`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/live-07-admin-wall-390.png`, fullPage: true })
  check('vendor admin enforces authentication', /sign in|log ?in|password/i.test(body))
  check('vendor admin leaks no customer records', !/GIFT-[0-9A-F]{6,}/.test(body) && !/9876\d{5}/.test(body))
  await page.close()
}
{
  const page = await mobile.newPage()
  wire(page, 'platformwall')
  await nav(page,`${BASE}/platform`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/live-08-platform-wall-390.png`, fullPage: true })
  check('platform admin enforces authentication', /sign in|log ?in|password|platform/i.test(body))
  await page.close()
}

// ---------- Legacy /store/{slug} canonicalises in-browser ----------
{
  const page = await mobile.newPage()
  wire(page, 'legacy')
  await nav(page,`${BASE}/store/jolly-enterprises`, { waitUntil: 'networkidle' })
  check('legacy /store/{slug} lands on /{slug}', page.url() === `${BASE}/jolly-enterprises`, page.url())
  await page.close()
}

// ---------- Shree Jewellers (shreejwellers) live surface, read-only (v1.3.0) ----------
// Same read-only discipline: invalid inputs only (the min-spin gate is
// client-side), never a valid entry, never a settings write. The owner
// sign-in section below navigates only and signs out again.
const SHREE_URLS = ['', '/costumer', '/customer']
for (const path of SHREE_URLS) {
  const label = `/shreejwellers${path}`
  const page = await mobile.newPage()
  wire(page, `shree${path || 'root'}`)
  await nav(page,`${BASE}/shreejwellers${path}`, { waitUntil: 'networkidle' })
  const title = await page.title()
  check(`${label} renders the Shree Jewellers shop`, title.includes('Shree Jewellers'), title)
  check(`${label} hero is the waiting screen`, await page.getByText('YOUR REWARD IS WAITING').isVisible())
  check(`${label} shows the shop name`, await page.getByRole('heading', { name: 'Shree Jewellers' }).first().isVisible())
  await page.screenshot({ path: `${OUT}/live-09-shree${path || '-root'}-390.png`, fullPage: true })

  await page.getByRole('button', { name: 'START' }).click()
  await page.getByLabel('Full name').waitFor({ timeout: 10000 })
  check(`${label} form label: Full name`, await page.getByLabel('Full name').isVisible())
  check(`${label} form label: Purchase amount in Indian Rupees`, await page.getByLabel('Purchase amount in Indian Rupees').isVisible())
  check(`${label} form label: 10-digit mobile number`, await page.getByLabel('10-digit mobile number').isVisible())
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(`${label} has no horizontal overflow (390x844)`, overflow <= 1, `overflow ${overflow}px`)
  await page.close()
}

// min-spin gate: ₹4,999 must be rejected client-side (no RPC, no record)
{
  const page = await mobile.newPage()
  wire(page, 'shreegate')
  await nav(page,`${BASE}/shreejwellers`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'START' }).click()
  await page.getByLabel('Full name').waitFor({ timeout: 10000 })
  await page.getByLabel('Full name').fill('Audit Probe')
  await page.getByLabel('Purchase amount in Indian Rupees').fill('4999')
  await page.getByLabel('10-digit mobile number').fill('9876543210')
  await page.screenshot({ path: `${OUT}/live-10-shree-gate-input-390.png`, fullPage: true })
  await page.getByRole('button', { name: 'CONTINUE' }).click()
  await page.waitForTimeout(400)
  const body = await page.locator('body').innerText()
  check(
    '₹4,999 is rejected by the ₹5,000 gate',
    /available on purchases of/i.test(body) && /5[, ]?000/.test(body),
    body.match(/[^\n]*available on purchases[^\n]*/i)?.[0] ?? 'no gate message',
  )
  check(
    'gate rejection issues no submit_customer_entry RPC',
    !rpcCalls.some((r) => r.includes('submit_customer_entry')),
    rpcCalls.join(', ') || 'zero RPC calls',
  )
  await page.screenshot({ path: `${OUT}/live-11-shree-gate-390.png`, fullPage: true })
  await page.close()
}

// desktop capture of the Shree shop
{
  const page = await desktop.newPage()
  wire(page, 'shreeDesk')
  await nav(page,`${BASE}/shreejwellers`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/live-12-shree-shop-1280.png`, fullPage: true })
  check('desktop Shree shop page renders', await page.getByRole('heading', { name: 'Shree Jewellers' }).first().isVisible())
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('desktop Shree shop page has no horizontal overflow', overflow <= 1, `overflow ${overflow}px`)
  await page.close()
}

// admin auth wall (read-only)
{
  const page = await mobile.newPage()
  wire(page, 'shreeadminwall')
  await nav(page,`${BASE}/shreejwellers/admin`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/live-13-shree-admin-wall-390.png`, fullPage: true })
  check('Shree admin URL shows the shop-owner login wall', /Sign in to manage your campaign/i.test(body))
  check('Shree admin wall leaks no customer records', !/GIFT-[0-9A-F]{6,}/.test(body) && !/BAG-|SPKS-|SARE-|DINR-|MIXR-/.test(body))
  await page.close()
}

// authenticated dashboard (navigates only, signs out again; read-only)
const LIVE_OWNER_EMAIL = process.env.SHREE_OWNER_EMAIL ?? ''
const LIVE_OWNER_PASSWORD = process.env.JRIQ_OWNER_PASSWORD ?? ''
if (LIVE_OWNER_EMAIL && LIVE_OWNER_PASSWORD) {
  async function signInAndCheckIdentity(ctx, tag, scope, shotName) {
    const page = await ctx.newPage()
    wire(page, tag)
    await nav(page,`${BASE}/shreejwellers/admin`, { waitUntil: 'networkidle' })
    await page.locator('input[type=email]').fill(LIVE_OWNER_EMAIL)
    await page.locator('input[type=password]').fill(LIVE_OWNER_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Wait for the workspace (or a login error) without crashing; the
    // post-sign-in state is captured as evidence either way.
    // The shell renders Sign out twice (mobile top-bar button with
    // aria-label, desktop sidebar button with visible text); match any
    // visible button bearing the label in either form.
    const signOut = page.locator('button:has-text("Sign out"):visible').first()
    let workspace = false
    for (let i = 0; i < 20 && !workspace; i++) {
      await page.waitForTimeout(1000)
      workspace = (await signOut.count().catch(() => 0)) > 0
    }
    await page.waitForTimeout(1000)
    const afterUrl = page.url()
    const afterBody = await page.locator('body').innerText().catch(() => '')
    rows.push(`INFO  [${tag}] post-sign-in url: ${afterUrl}`)
    rows.push(`INFO  [${tag}] post-sign-in body: ${afterBody.slice(0, 160).replace(/\n/g, ' ')}`)
    await page.screenshot({ path: `${OUT}/${shotName.replace('.png', '')}-signin-state.png`, fullPage: true })
    check(`live admin sign-in reaches the workspace (${tag})`, workspace, afterUrl)

    if (workspace) {
      const region = page.locator(scope)
      const identity = await region.getByText('Shree Jewellers').first().isVisible().catch(() => false)
      check(`live admin dashboard shows the Shree Jewellers identity (${scope}, ${tag})`, identity)
      const body = await page.locator('body').innerText()
      check(
        `live admin workspace exposes no other tenant data (${tag})`,
        !/Jolly|jolly-enterprises/i.test(body),
        body.slice(0, 80).replace(/\n/g, ' '),
      )
      await page.screenshot({ path: `${OUT}/${shotName}`, fullPage: true })
      await signOut.click().catch(() => {})
      await page.waitForTimeout(1500)
      const wallBack = /Sign in to manage your campaign/i.test(await page.locator('body').innerText().catch(() => ''))
      check(`live admin sign out returns to the login wall (${tag})`, wallBack)
    }
    await page.close()
  }
  await signInAndCheckIdentity(mobile, 'shreeAdmin390', 'main', 'live-14-shree-admin-dash-390.png')
  await signInAndCheckIdentity(desktop, 'shreeAdmin1280', 'aside', 'live-15-shree-admin-dash-1280.png')
} else {
  rows.push('INFO  live owner sign-in skipped (SHREE_OWNER_EMAIL / JRIQ_OWNER_PASSWORD not set)')
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
