// Customer-side visual audit (Phase 1, P0-1) -- STAGING ONLY.
//
// Creates two synthetic shops through the normal application path (create_shop):
//   A = fully branded (logo uploaded through storage, subtitle, badge, colors)
//   B = bare (nothing set -- exposes every default/fallback defect)
// then walks the customer flow at 390x844 through EVERY step and screenshots it:
// landing, details (empty/invalid/filled), review, wheel, mid-spin, reveal,
// thank-you, plus the bare landing, the inactive state and not-found.
// Self-cleaning: deletes its own shops, users and storage objects at the end.
//
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... node scripts/audit-customer-visual.mjs
// Evidence: %TEMP%/jriq-visual-audit/<shot>.png + manifest.txt
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const API_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!API_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY')
  process.exit(2)
}
if (!API_URL.includes('wpytaorgiqkfnifsuhax')) {
  console.error(`Refusing to run: ${API_URL} is not the verified staging project (wpytaorgiqkfnifsuhax)`)
  process.exit(2)
}

const REPO = process.cwd()
const EVIDENCE = join(tmpdir(), 'jriq-visual-audit')
mkdirSync(EVIDENCE, { recursive: true })
const manifest = join(EVIDENCE, 'manifest.txt')
writeFileSync(manifest, `visual audit ${new Date().toISOString()}\n`, 'utf8')
function note(text) {
  console.log(text)
  appendFileSync(manifest, text + '\n', 'utf8')
}

const service = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ---------------------------------------------------------------------------
// Build the root app against the staging backend (same recipe as the accepted
// staging harnesses), then serve dist with root-host SPA semantics.
// ---------------------------------------------------------------------------
function runBuild(outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      // --mode root: base '/' (a Pages-base bundle 404s on the root-mounted server)
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir', '--mode', 'root'],
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

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
}
function startServer(distDir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = decodeURIComponent((req.url ?? '/').split('?')[0])
      if (path === '/') path = '/index.html'
      const safe = normalize(path).replace(/^([/\\])+/, '')
      const file = join(distDir, safe)
      if (safe && !safe.includes('..') && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        res.end(readFileSync(file))
        return
      }
      res.writeHead(200, { 'content-type': MIME['.html'] })
      res.end(readFileSync(join(distDir, 'index.html')))
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

// ---------------------------------------------------------------------------
// Synthetic shops
// ---------------------------------------------------------------------------
const run = Date.now().toString(36)
const slugA = `audit-brand-${run}`
const slugB = `audit-bare-${run}`
const nameA = `Kalyan Jewellers ${run}`
const nameB = `Bare Gems ${run}`
const ownerA = `audit-owner-a-${run}@example.com`
const ownerB = `audit-owner-b-${run}@example.com`
const password = `Audit-${run}-Visual!x`
const userIds = []
const storeIds = []
let logoUrl = ''
const consoleErrors = []
// The purchase amount walked through the flow; the fixture pool must cover it.
const PURCHASE_AMOUNT = 45000
// Kept for failure diagnostics (screenshot + DOM probe when a step fails).
let pageRef = null
let lastStep = 'setup'

async function makeUser(email) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  userIds.push(data.user.id)
  return data.user
}

async function uploadLogo() {
  // Render a realistic wordmark logo through Chromium (known aspect ratio, so
  // logo fit/crop is judgeable in the screenshots).
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 480, height: 240 } })
  await page.setContent(`
    <body style="margin:0;display:flex;align-items:center;justify-content:center;
                 background:#0F5132;width:480px;height:240px">
      <div style="text-align:center;color:#C9A227;font-family:Georgia,serif">
        <div style="font-size:64px;line-height:1">&#9670;</div>
        <div style="font-size:34px;letter-spacing:6px;font-weight:700">KALYAN</div>
        <div style="font-size:13px;letter-spacing:4px;color:#F3E9C9">JEWELLERS SINCE 1954</div>
      </div>
    </body>`)
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 480, height: 240 } })
  await browser.close()
  const objectPath = `audit-${run}/logo.png`
  const { error } = await service.storage.from('store-logos').upload(objectPath, png, {
    contentType: 'image/png', upsert: true,
  })
  if (error) throw new Error(`logo upload: ${error.message}`)
  const { data } = service.storage.from('store-logos').getPublicUrl(objectPath)
  return data.publicUrl
}

async function makeShop(slug, name, email, branding) {
  const user = await makeUser(email)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: user.id })
  if (paErr) throw new Error(`platform_admins: ${paErr.message}`)
  const platform = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: signInErr } = await platform.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`platform signIn: ${signInErr.message}`)
  const { data, error } = await platform.rpc('create_shop', {
    p_name: name, p_slug: slug, p_owner_email: email,
    p_logo_url: branding?.logoUrl ?? undefined,
  })
  if (error || !data?.length) throw new Error(`create_shop: ${error?.message ?? 'no row'}`)
  const shopId = data[0].shop_id
  storeIds.push(shopId)
  const { error: actErr } = await platform.rpc('set_store_status', { p_store_id: shopId, p_status: 'active' })
  if (actErr) throw new Error(`set_store_status: ${actErr.message}`)
  if (branding) {
    const { error: bErr } = await service.from('stores').update(branding).eq('id', shopId)
    if (bErr) throw new Error(`branding update: ${bErr.message}`)
  }
  return shopId
}

async function configureGiftPool(shopId, ownerEmail, purchaseAmount) {
  // Established fixture contract: materialize catalogue gifts into the pool of
  // the ONE bracket covering the purchase amount via save_store_gift_options
  // (rewards + tier_gift_options). submit_customer_entry only awards when
  // exactly one viable bracket (active gift pool or legacy reward) exists for
  // the amount; create_shop seeds brackets without any pool, so a real spin
  // would be refused ("No unique active reward is configured...") without this.
  const { data: tiers, error: tErr } = await service
    .from('reward_tiers')
    .select('id, min_amount, max_amount')
    .eq('store_id', shopId)
    .eq('active', true)
  if (tErr) throw new Error(`fixture reward_tiers: ${tErr.message}`)
  // Bracket ranges are half-open [min, max); the top bracket has max null.
  const covering = (tiers ?? []).filter(
    (t) => t.min_amount <= purchaseAmount && (t.max_amount == null || t.max_amount > purchaseAmount))
  if (covering.length !== 1) {
    throw new Error(`fixture: expected exactly 1 bracket covering ${purchaseAmount}, found ${covering.length}`)
  }
  const { data: catalog, error: cErr } = await service
    .from('gift_catalog')
    .select('id, name')
    .eq('active', true)
    .limit(4)
  if (cErr) throw new Error(`fixture gift_catalog: ${cErr.message}`)
  if (!catalog?.length) throw new Error('fixture: gift_catalog has no active gifts')
  const ids = catalog.map((g) => g.id)
  const owner = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: signInErr } = await owner.auth.signInWithPassword({ email: ownerEmail, password })
  if (signInErr) throw new Error(`fixture signIn: ${signInErr.message}`)
  const { error: gErr } = await owner.rpc('save_store_gift_options', {
    p_tier_id: covering[0].id,
    p_catalog_gift_ids: ids,
  })
  if (gErr) throw new Error(`save_store_gift_options: ${gErr.message}`)
  return ids.length
}

async function failDiagnostics(tag) {
  if (!pageRef) return
  try {
    await pageRef.screenshot({ path: join(EVIDENCE, `fail-${tag}.png`), fullPage: true, timeout: 15000 })
    note(`fail-diag screenshot fail-${tag}.png`)
    const probe = await pageRef.evaluate(() => ({
      url: location.href,
      wheel: document.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? null,
      buttons: Array.from(document.querySelectorAll('button')).map((b) => ({
        text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        label: b.getAttribute('aria-label'),
        disabled: b.hasAttribute('disabled'),
      })),
    }))
    note(`fail-diag ${tag}: ${JSON.stringify(probe)}`)
  } catch (e) {
    note(`fail-diag ${tag}: probe failed -- ${e.message}`)
  }
}

async function cleanup() {
  for (const id of storeIds) {
    await service.from('stores').delete().eq('id', id)
    await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', id)
    await service.from('platform_audit_logs').delete().eq('store_id', id)
    await service.from('submissions').delete().eq('store_id', id)
    await service.from('public_submission_rate_limits').delete().eq('store_id', id)
    await service.from('store_admins').delete().eq('store_id', id)
    // FK-safe order: options reference tiers+rewards; tiers may reference rewards.
    await service.from('tier_gift_options').delete().eq('store_id', id)
    await service.from('reward_tiers').delete().eq('store_id', id)
    await service.from('rewards').delete().eq('store_id', id)
    await service.from('store_subscriptions').delete().eq('store_id', id)
    await service.from('store_owner_invitations').delete().eq('store_id', id)
  }
  await service.storage.from('store-logos').remove([`audit-${run}/logo.png`])
  for (const id of userIds) await service.auth.admin.deleteUser(id)
  note(`CLEANUP done (shops ${storeIds.length}, users ${userIds.length})`)
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------
async function main() {
  note(`build: root build against staging backend`)
  await runBuild('dist-accept-visual')
  const { server, port } = await startServer(join(REPO, 'dist-accept-visual'))
  const origin = `http://127.0.0.1:${port}`

  logoUrl = await uploadLogo()
  note(`logo uploaded: ${logoUrl}`)
  const shopA = await makeShop(slugA, nameA, ownerA, {
    logo_url: logoUrl,
    subtitle: 'EXCLUSIVE REWARDS',
    campaign_badge: 'SPIN & WIN',
    primary_color: '#0F5132',
    secondary_color: '#C9A227',
  })
  const shopB = await makeShop(slugB, nameB, ownerB, null)
  note(`shops: A=${slugA} (branded, ${shopA}) B=${slugB} (bare, ${shopB})`)
  const poolSize = await configureGiftPool(shopA, ownerA, PURCHASE_AMOUNT)
  note(`gift pool: ${poolSize} catalogue gifts on the bracket covering ${PURCHASE_AMOUNT}`)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  pageRef = page
  page.setDefaultTimeout(25000)
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`))
  const shot = async (tag) => {
    lastStep = tag
    await page.screenshot({ path: join(EVIDENCE, `${tag}.png`), fullPage: true, timeout: 15000 })
    note(`SHOT ${tag}.png url=${page.url()}`)
  }

  // A: branded shop, full journey
  await page.goto(`${origin}/${slugA}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('a01-landing')
  await page.getByRole('button', { name: 'START' }).click()
  await page.waitForTimeout(400)
  await shot('a02-details-empty')
  await page.locator('button[type="submit"]').first().click() // validation errors
  await page.getByText('Please enter your name.').waitFor()
  await page.getByText('Please enter your purchase amount.').waitFor()
  await page.waitForTimeout(400)
  await shot('a03-details-invalid')
  // Fill via the product's own aria-labels (source truth). The money placeholder
  // is DYNAMIC (₹${minSpinAmount} — shops default to ₹1,000 via the platform
  // catalog), so never target it with a hardcoded literal.
  await page.getByLabel('Full name').fill('Aarav Sharma')
  await page.getByLabel('Purchase amount in Indian Rupees').fill(String(PURCHASE_AMOUNT))
  await page.getByLabel('10-digit mobile number').fill('9876543210')
  await page.waitForTimeout(300)
  await shot('a04-details-filled')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(600)
  await shot('a05-review')
  await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).click()
  await page.waitForTimeout(800)
  await shot('a06-wheel')
  // SpinWheel.tsx: the centre button's accessible name is the aria-label
  // 'Spin the wheel' when ready (canSpin) and 'Spinning...' otherwise — the
  // visible 'SPIN' text is NOT the accessible name. Waiting on that name IS
  // the ready-state wait; the click additionally requires it to be enabled.
  lastStep = 'a06-wheel-spin-click'
  const spinButton = page.getByRole('button', { name: 'Spin the wheel' })
  try {
    await spinButton.waitFor({ state: 'visible', timeout: 15000 })
    if (!(await spinButton.isEnabled())) throw new Error('spin button present but disabled')
  } catch (e) {
    await failDiagnostics('spin-not-ready')
    throw new Error(`wheel cannot become ready -- ${e.message}`)
  }
  await spinButton.click()
  await page.waitForTimeout(1500)
  await shot('a07-wheel-midspin')
  await page.getByText('YOU WON').waitFor({ timeout: 30000 })
  await page.waitForTimeout(600)
  await shot('a08-reveal')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await page.waitForTimeout(600)
  await shot('a09-thankyou')

  // B: bare shop landing (defaults / fallback defects)
  await page.goto(`${origin}/${slugB}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('b01-landing-bare')

  // B: inactive state
  const platform2 = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  await platform2.auth.signInWithPassword({ email: ownerA, password })
  // Real status enum: active | suspended | onboarding ('paused' does not exist).
  const { error: susErr } = await platform2.rpc('set_store_status', { p_store_id: shopB, p_status: 'suspended' })
  if (susErr) throw new Error(`set_store_status suspended: ${susErr.message}`)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('This campaign is not active right now.').waitFor()
  await page.waitForTimeout(800)
  await shot('b02-inactive')
  const { error: reactErr } = await platform2.rpc('set_store_status', { p_store_id: shopB, p_status: 'active' })
  if (reactErr) throw new Error(`set_store_status active: ${reactErr.message}`)

  // not-found
  await page.goto(`${origin}/no-such-shop-${run}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await shot('c01-notfound')

  note(`console errors: ${consoleErrors.length}`)
  for (const e of consoleErrors.slice(0, 10)) note(`  console: ${e}`)
  await browser.close()
  server.close()
}

try {
  await main()
  note(`AUDIT RESULT shots in ${EVIDENCE}`)
} catch (e) {
  note(`AUDIT FAIL harness -- ${e.message}`)
  await failDiagnostics(lastStep)
  note(`console errors: ${consoleErrors.length}`)
  for (const er of consoleErrors.slice(0, 10)) note(`  console: ${er}`)
  process.exitCode = 1
} finally {
  try { await cleanup() } catch (e) { note(`CLEANUP FAIL -- ${e.message}`) }
}
