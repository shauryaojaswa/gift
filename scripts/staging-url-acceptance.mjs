// JRIQ v1.1.0 Phase 4 - URL-restructure acceptance on STAGING.
//
// Builds the REAL app twice against the staging backend (Pages base '/gift/'
// with 404.html restore semantics, and root base '/' with .htaccess rewrite
// semantics), serves each exactly as its host does, and drives Chromium through
// the acceptance rows A1-A9 with a hard reload on every row. Screenshots land in
// %TEMP%/jriq-url-acceptance (evidence pack).
//
// Shop identity on the customer page = the shop subtitle (names render on the
// admin workspace and the inactive page), so fixtures set a unique subtitle per
// shop and every row asserts on that exact text.
//
// Synthetic data only: two disposable shops + owners created through the
// platform RPCs, removed afterwards. Never point this at production.
//
// Usage (PowerShell):
//   $keys = npx.cmd supabase projects api-keys --project-ref wpytaorgiqkfnifsuhax --output json | ConvertFrom-Json
//   $env:SUPABASE_STAGING_URL = 'https://wpytaorgiqkfnifsuhax.supabase.co'
//   $env:SUPABASE_STAGING_ANON_KEY = ($keys | Where-Object name -eq 'anon').api_key
//   $env:SUPABASE_STAGING_SERVICE_KEY = ($keys | Where-Object name -eq 'service_role').api_key
//   node scripts/staging-url-acceptance.mjs
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const API_URL = process.env.SUPABASE_STAGING_URL
const ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_STAGING_SERVICE_KEY

if (!API_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_STAGING_URL / _ANON_KEY / _SERVICE_KEY')
  process.exit(2)
}
if (!API_URL.includes('wpytaorgiqkfnifsuhax')) {
  console.error(`Refusing to run: ${API_URL} is not the verified staging project`)
  process.exit(2)
}

const REPO = process.cwd()
const EVIDENCE = join(tmpdir(), 'jriq-url-acceptance')
mkdirSync(EVIDENCE, { recursive: true })

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}
async function expectError(name, promise, needle) {
  const { error } = await promise
  if (!error) {
    check(name, false, 'expected an error, got success')
  } else if (needle && !error.message.includes(needle)) {
    check(name, false, `error was: ${error.message}`)
  } else {
    check(name, true)
  }
}

const service = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
const platform = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })

const run = Date.now().toString(36)
const passwords = {}
const userIds = []
const storeIds = []
async function makeUser(tag, email) {
  const password = `Accept-${run}-${tag}!x`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  userIds.push(data.user.id)
  passwords[email] = password
  return data.user
}
const phoneSeq = () => `${'6789'[Math.floor(Math.random() * 4)]}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

// ---------------------------------------------------------------------------
// Builds: real production bundles against the staging backend. VITE_PUBLIC_APP_URL
// is the canonical customer domain (what QR codes must show) regardless of where
// the dashboard is served from.
// ---------------------------------------------------------------------------
function runBuild(outDir, extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir', ...extraArgs],
      {
        cwd: REPO,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: API_URL,
          VITE_SUPABASE_ANON_KEY: ANON_KEY,
          VITE_PUBLIC_APP_URL: 'https://jriq.in',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`build ${outDir} exit ${code}\n${out}`))))
  })
}

// ---------------------------------------------------------------------------
// Static server mimicking each host's SPA fallback:
//   pages: unknown path -> 404.html (the ?p= restore script runs, exactly GitHub Pages)
//   root:  unknown path -> index.html 200 (the .htaccess rewrite)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
}
function startServer(distDir, mountPath, mode) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = decodeURIComponent((req.url ?? '/').split('?')[0])
      if (mountPath !== '/' && path.startsWith(mountPath)) path = path.slice(mountPath.length - 1)
      if (path === '/') path = '/index.html'
      const safe = normalize(path).replace(/^([/\\])+/, '')
      const file = join(distDir, safe)
      if (safe && !safe.includes('..') && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        res.end(readFileSync(file))
        return
      }
      const fallback = mode === 'pages' ? '404.html' : 'index.html'
      res.writeHead(mode === 'pages' ? 404 : 200, { 'content-type': MIME['.html'] })
      res.end(readFileSync(join(distDir, fallback)))
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

// ---------------------------------------------------------------------------
// Acceptance rows for one build
// ---------------------------------------------------------------------------
async function runRows(browser, label, distDir, mountPath, mode, data) {
  const { server, port } = await startServer(distDir, mountPath, mode)
  const origin = `http://127.0.0.1:${port}`
  const home = `${origin}${mountPath === '/' ? '/' : mountPath}`
  const ctx = await browser.newContext({ acceptDownloads: true })
  const page = await ctx.newPage()
  page.setDefaultTimeout(25000)
  const shot = async (tag) => {
    try {
      await page.screenshot({ path: join(EVIDENCE, `${label}-${tag}.png`), fullPage: true, timeout: 10000 })
    } catch {
      // evidence-only; a screenshot must never fail a row
    }
  }
  const textOf = async () => (await page.textContent('body')) ?? ''
  const hardReload = () => page.reload({ waitUntil: 'load' })
  const goto = (u) => page.goto(u, { waitUntil: 'load' })
  // Wait-based assertion: tolerates the Pages 404-restore chain and post-login
  // data loads. Substring, case-insensitive (Playwright default).
  async function expectText(row, locator, detail = '', timeoutMs = 25000) {
    try {
      await locator.first().waitFor({ timeout: timeoutMs })
      check(row, true)
      return true
    } catch {
      const body = await textOf()
      check(row, false, detail || `not visible within ${timeoutMs / 1000}s -- page said: ${body.slice(0, 160)}`)
      await shot(`${row.replace(/[^A-Za-z0-9]+/g, '-')}-failure`)
      return false
    }
  }
  async function expectGone(row, text) {
    const body = await textOf()
    check(row, !body.includes(text), `unexpected text: ${text}`)
  }
  const clearSession = () => page.evaluate(() => window.localStorage.clear())

  // A1 platform homepage: renders, never auto-redirects (hard refresh twice)
  await goto(home)
  await hardReload()
  await expectText(`A1 ${label}: "/" renders the JRIQ homepage`, page.getByRole('heading', { name: 'JRIQ' }))
  await expectText(`A1 ${label}: homepage sells the platform to jewellers`, page.getByText('For jewellers'))
  check(`A1 ${label}: "/" never auto-redirects (hard refresh x2)`,
    new URL(page.url()).pathname === (mountPath === '/' ? '/' : mountPath), page.url())
  await shot('a1-home')

  // A2/A3 root-level shop pages show exactly their own shop
  await goto(`${home}${data.slugA}`)
  await hardReload()
  await expectText(`A2 ${label}: "/{slugA}" shows shop A`, page.getByText(data.subtitleA))
  await expectGone(`A2 ${label}: "/{slugA}" never leaks shop B`, data.subtitleB)
  await shot('a2-shop-a')

  await goto(`${home}${data.slugB}`)
  await hardReload()
  await expectText(`A3 ${label}: "/{slugB}" shows shop B`, page.getByText(data.subtitleB))
  await expectGone(`A3 ${label}: "/{slugB}" never leaks shop A`, data.subtitleA)
  await shot('a3-shop-b')

  // A4 ownership wall: anon -> login; owner B at shop A -> 403 with zero shop A data
  await goto(`${home}${data.slugA}/admin`)
  await expectText(`A4 ${label}: anon "/{slugA}/admin" hits the login wall`, page.getByPlaceholder('you@store.com'))
  check(`A4 ${label}: login wall is the vendor login route`, page.url().includes('vendor/login'), page.url())
  await shot('a4-anon-wall')

  await page.getByPlaceholder('you@store.com').fill(data.ownerBEmail)
  await page.getByPlaceholder('••••••••').fill(data.ownerBPassword)
  await page.locator('button[type="submit"]').click()
  await expectText(`A4 ${label}: owner B at "/{slugA}/admin" gets 403 Forbidden`, page.getByText('403'))
  await expectText(`A4 ${label}: 403 explains the ownership wall`, page.getByText('belongs to another shop'))
  await expectGone(`A4 ${label}: 403 page leaks zero shop A name`, data.nameA)
  await expectGone(`A4 ${label}: 403 page leaks zero shop A slug`, data.slugA)
  await shot('a4-forbidden')

  await clearSession()
  await goto(`${home}${data.slugA}/admin`)
  await expectText(`A4 ${label}: owner A re-auth at "/{slugA}/admin"`, page.getByPlaceholder('you@store.com'))
  await page.getByPlaceholder('you@store.com').fill(data.ownerAEmail)
  await page.getByPlaceholder('••••••••').fill(data.ownerAPassword)
  await page.locator('button[type="submit"]').click()
  await expectText(`A4 ${label}: owner A at "/{slugA}/admin" sees own workspace`, page.getByText(data.nameA))
  check(`A4 ${label}: owner A URL stays in the shop-scoped admin`,
    new URL(page.url()).pathname.includes(`/${data.slugA}/admin`), page.url())
  await expectGone(`A4 ${label}: owner A workspace shows zero shop B data`, data.nameB)
  await shot('a4-owner-a')

  // A5 legacy /store/:slug redirects losslessly to /{slug}
  await clearSession()
  await goto(`${home}store/${data.slugA}`)
  await expectText(`A5 ${label}: "/store/{slugA}" is lossless (same shop)`, page.getByText(data.subtitleA))
  check(`A5 ${label}: "/store/{slugA}" lands on "/{slugA}"`,
    new URL(page.url()).pathname.endsWith(`/${data.slugA}`), page.url())
  await shot('a5-legacy-redirect')

  // A6 system routes + unknown slug behaviour
  await goto(`${home}platform`)
  await page.waitForTimeout(2500)
  check(`A6 ${label}: "/platform" stays a system route (not a shop)`,
    page.url().includes('/platform') && !(await textOf()).includes(data.subtitleA), page.url())
  await goto(`${home}definitely-not-a-shop-${run}`)
  await hardReload()
  await expectText(`A6 ${label}: unknown slug shows the designed not-found`, page.getByText('Page not found'))
  await expectGone(`A6 ${label}: unknown slug loads no shop data`, data.subtitleA)
  await expectGone(`A6 ${label}: unknown slug never falls back to another shop`, data.subtitleB)
  await shot('a6-not-found')

  // A6b canonical slug policy: an uppercase URL must NOT case-fold to a real shop
  // (the defined treatment is "not found" — no ambiguous case-insensitive match).
  await goto(`${home}${data.slugA.toUpperCase()}`)
  await hardReload()
  await expectText(`A6b ${label}: uppercase /{SLUG} shows not-found (no case folding)`, page.getByText('Page not found'))
  await expectGone(`A6b ${label}: uppercase URL loads no shop data`, data.subtitleA)
  await shot('a6b-uppercase')

  // A7 suspended shop: inactive page + backend rejects submissions
  await platform.rpc('set_store_status', { p_store_id: data.shopBId, p_status: 'suspended' })
  await goto(`${home}${data.slugB}`)
  await hardReload()
  await expectText(`A7 ${label}: suspended shop shows the inactive page`, page.getByText('not active right now'))
  await expectText(`A7 ${label}: inactive page names the shop`, page.getByText(data.nameB))
  await expectGone(`A7 ${label}: inactive page offers no spin`, 'Spin Now')
  await shot('a7-suspended')
  await expectError(`A7 ${label}: backend rejects submissions for suspended shop`, anon.rpc('submit_customer_entry', {
    p_store_slug: data.slugB,
    p_request_id: randomUUID(),
    p_customer_name: 'Acceptance Blocked',
    p_customer_phone: phoneSeq(),
    p_purchase_amount: 5000,
  }), 'Campaign is unavailable')
  await platform.rpc('set_store_status', { p_store_id: data.shopBId, p_status: 'active' })

  // A8 QR URL is the customer address: https://jriq.in/{slug}, never admin/legacy
  await clearSession()
  await goto(`${home}${data.slugA}/admin/qr-code`)
  await expectText(`A8 ${label}: owner A opens the QR page`, page.getByPlaceholder('you@store.com'))
  await page.getByPlaceholder('you@store.com').fill(data.ownerAEmail)
  await page.getByPlaceholder('••••••••').fill(data.ownerAPassword)
  await page.locator('button[type="submit"]').click()
  await expectText(`A8 ${label}: QR targets https://jriq.in/{slug}`, page.getByText(`https://jriq.in/${data.slugA}`))
  const a8Body = await textOf()
  check(`A8 ${label}: QR never shows legacy /store/ paths`, !a8Body.includes(`/store/${data.slugA}`))
  check(`A8 ${label}: QR never shows an admin path`, !a8Body.includes(`/${data.slugA}/admin`))
  await shot('a8-qr')

  // A8b the QR payload itself: decode the rendered symbol (not the visible text).
  const { PNG } = await import('pngjs')
  const { default: jsQR } = await import('jsqr')
  const qrBuffer = await page.locator('img[alt="QR code linking to your public campaign"]').first().screenshot()
  const png = PNG.sync.read(qrBuffer)
  const decoded = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height)
  check(`A8b ${label}: decoded QR payload is exactly https://jriq.in/{slug}`,
    decoded?.data === `https://jriq.in/${data.slugA}`, decoded?.data ?? 'no QR symbol decoded')

  // A8c real browser download of the QR artefact
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Download QR code' }).click(),
  ])
  check(`A8c ${label}: QR download succeeds`, download.suggestedFilename() === `${data.slugA}-campaign-qr.png`, download.suggestedFilename())

  // A9 engine invariant through the new URL: entry -> spin -> claim code
  await clearSession()
  await goto(`${home}${data.slugB}`)
  await expectText(`A9 ${label}: journey starts at "/{slugB}"`, page.getByRole('button', { name: 'START' }))
  await page.getByRole('button', { name: 'START' }).click()
  await page.getByLabel('Full name').fill('Acceptance Customer')
  await page.getByLabel('10-digit mobile number').fill(phoneSeq())
  await page.getByPlaceholder('₹').first().fill('5000')
  await page.locator('button[type="submit"]').click()
  // The flow is WELCOME -> DETAILS -> REVIEW_INVITATION -> SPIN unconditionally;
  // the review step always offers 'CONTINUE TO SPIN' (its Google buttons are
  // conditional). Advance through it, then spin.
  const continueBtn = page.getByRole('button', { name: 'CONTINUE TO SPIN' })
  try {
    await continueBtn.first().waitFor({ timeout: 10000 })
    await continueBtn.first().click()
  } catch {
    // review step absent (flow variant) - proceed straight to the spin step
  }
  await expectText(`A9 ${label}: spin step renders at "/{slugB}"`, page.getByText('YOUR REWARD IS READY'))
  // Normal flow spins by tapping the wheel hub (aria-label 'Spin the wheel'; the
  // review-return variant adds 'Spin Now'). Target the hub by its exact label.
  const spinTrigger = page.getByRole('button', { name: 'Spin the wheel', exact: true })
  await expectText(`A9 ${label}: spin trigger is present at "/{slugB}"`, spinTrigger)
  await spinTrigger.click()
  await expectText(`A9 ${label}: journey yields the reward screen`, page.getByText('YOU WON'), '', 45000)
  const claimCode = ((await page.locator('code').first().textContent()) ?? '').trim()
  check(`A9 ${label}: claim code rendered`, claimCode.includes('-'), claimCode)
  await shot('a9-journey')

  await ctx.close()
  server.close()
}

async function main() {
  // ---- synthetic tenants ----
  const adminEmail = `accept-admin-${run}@example.com`
  const aEmail = `accept-owner-a-${run}@example.com`
  const bEmail = `accept-owner-b-${run}@example.com`
  const adminUser = await makeUser('admin', adminEmail)
  await makeUser('a', aEmail)
  await makeUser('b', bEmail)
  await service.from('platform_admins').insert({ user_id: adminUser.id })
  await platform.auth.signInWithPassword({ email: adminEmail, password: passwords[adminEmail] })

  const slugA = `accept-a-${run}`
  const slugB = `accept-b-${run}`
  const nameA = `Acceptance Shop A ${run}`
  const nameB = `Acceptance Shop B ${run}`
  const subtitleA = `SUBA-${run}`
  const subtitleB = `SUBB-${run}`
  for (const [name, slug, email] of [[nameA, slugA, aEmail], [nameB, slugB, bEmail]]) {
    const { data, error } = await platform.rpc('create_shop', { p_name: name, p_slug: slug, p_owner_email: email })
    if (error || !data?.[0]) throw new Error(`create_shop ${slug}: ${error?.message}`)
    storeIds.push(data[0].shop_id)
    await platform.rpc('set_store_status', { p_store_id: data[0].shop_id, p_status: 'active' })
  }
  const shopAId = storeIds[0]
  const shopBId = storeIds[1]

  // Distinct subtitles: the customer page identifies its shop by subtitle.
  const { error: subErr } = await service.from('stores')
    .update({ subtitle: subtitleA }).eq('id', shopAId)
  const { error: subErrB } = await service.from('stores')
    .update({ subtitle: subtitleB }).eq('id', shopBId)
  if (subErr || subErrB) throw new Error(`subtitle fixture: ${subErr?.message ?? subErrB?.message}`)

  // Gift + pool for shop B so the journey can assign a real reward.
  const { data: giftB } = await service.from('rewards').insert({
    store_id: shopBId, name: `Acceptance Gift ${run}`, wheel_label: 'ACCEPT',
    description: 'acceptance fixture', claim_code_prefix: 'ACC', validity_text: 'fixture', active: true,
  }).select().single()
  const { data: tiersB } = await service.from('reward_tiers').select('*').eq('store_id', shopBId).order('min_amount')
  const ownerBClient = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  await ownerBClient.auth.signInWithPassword({ email: bEmail, password: passwords[bEmail] })
  const bindRes = await ownerBClient.rpc('save_store_tiers', {
    p_tiers: (tiersB ?? []).map((t) => ({
      id: t.id, min_amount: t.min_amount, max_amount: t.max_amount,
      reward_id: giftB.id, target_segment: t.target_segment, active: t.active,
    })),
  })
  if (bindRes.error) throw new Error(`bind pool: ${bindRes.error.message}`)

  const data = {
    slugA, slugB, nameA, nameB, subtitleA, subtitleB, shopAId, shopBId,
    ownerAEmail: aEmail, ownerAPassword: passwords[aEmail],
    ownerBEmail: bEmail, ownerBPassword: passwords[bEmail],
  }

  // ---- real builds against staging, each with its host fallback semantics ----
  console.log('INFO  building pages-base bundle (fallback: 404.html restore, like GitHub Pages)')
  await runBuild('dist-accept-pages', [])
  console.log('INFO  building root-base bundle (fallback: index.html rewrite, like MilesWeb/.htaccess)')
  await runBuild('dist-accept-root', ['--mode', 'root'])

  const browser = await chromium.launch()
  try {
    await runRows(browser, 'pages', join(REPO, 'dist-accept-pages'), '/gift/', 'pages', data)
    await runRows(browser, 'root', join(REPO, 'dist-accept-root'), '/', 'root', data)
  } finally {
    await browser.close()
  }
}

async function cleanup() {
  for (const id of storeIds) {
    await service.from('platform_audit_logs').delete().eq('store_id', id)
    await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', id)
    await service.from('tier_gift_options').delete().eq('store_id', id)
    await service.from('submissions').delete().eq('store_id', id)
    await service.from('reward_tiers').delete().eq('store_id', id)
    await service.from('rewards').delete().eq('store_id', id)
    await service.from('public_submission_rate_limits').delete().eq('store_id', id)
    await service.from('store_owner_invitations').delete().eq('store_id', id)
    await service.from('store_subscriptions').delete().eq('store_id', id)
    await service.from('store_admins').delete().eq('store_id', id)
    await service.from('stores').delete().eq('id', id)
  }
  await service.from('platform_admins').delete().in('user_id', userIds)
  for (const id of userIds) {
    await service.auth.admin.deleteUser(id)
  }
}

main()
  .catch((err) => {
    fail += 1
    console.error(`FAIL  acceptance crashed -- ${err?.message ?? err}`)
  })
  .finally(async () => {
    await cleanup()
    console.log(`\nRESULT ${pass} passed, ${fail} failed (URL acceptance, staging, evidence in ${EVIDENCE})`)
    process.exit(fail > 0 ? 1 : 0)
  })
