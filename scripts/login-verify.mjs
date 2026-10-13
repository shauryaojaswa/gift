import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const checks = []
const check = (ok, msg) => checks.push(`${ok ? 'PASS' : 'FAIL'}: ${msg}`)

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()) })

  // 1. Load the vendor login page directly (SPA deep link).
  await page.goto(`${BASE}/vendor/login`, { waitUntil: 'networkidle' })
  check(await page.locator('h1').filter({ hasText: /Shop Owner/i }).first().isVisible(), 'vendor login heading renders')

  // 2. Dev-only preview banner present.
  const banner = await page.locator('text=/Local preview/i').first().isVisible().catch(() => false)
  check(banner, 'dev-only "Local preview" banner shown')

  // 3. Enter any email (password optional) and sign in.
  await page.locator('input[type="email"]').fill('owner@shop.test')
  await page.getByRole('button', { name: /^Sign in$/ }).click()

  // 4. Expect redirect to /vendor/dashboard.
  await page.waitForURL(/\/vendor\/dashboard/, { timeout: 6000 }).catch(() => {})
  check(/\/vendor\/dashboard/.test(page.url()), `redirected to dashboard (got ${page.url()})`)

  // 5. Dashboard actually renders content (Overview heading / stat cards).
  await page.waitForTimeout(600)
  const bodyText = await page.locator('body').innerText()
  check(/Overview|Total customer|Total rewards|Awaiting/i.test(bodyText), 'dashboard overview content rendered')

  // 6. Persistence banner (no Supabase in dev) is shown honestly.
  check(/Persistent storage is not configured/i.test(bodyText), 'honest "persistence not configured" banner shown')

  // 7. Sign out returns to login.
  const signOut = page.getByRole('button', { name: /Sign out/i }).first()
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click()
    await page.waitForURL(/\/vendor\/login/, { timeout: 5000 }).catch(() => {})
    check(/\/vendor\/login/.test(page.url()), 'sign out returns to login')
  } else {
    check(false, 'sign out button found')
  }

  check(pageErrors.length === 0, `no page/console errors (saw: ${pageErrors.join(' | ') || 'none'})`)

  await browser.close()
  console.log(checks.join('\n'))
  const failed = checks.filter((c) => c.startsWith('FAIL'))
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(2) })
