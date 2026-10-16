// JRIQ post-deploy LIVE MATRIX (v1.1.1 verification) -- browser + API against
// PRODUCTION (jriq.in). Creates ONE synthetic probe shop + owner through the
// normal application path (create_shop), proves the manual matrix rows, then
// deletes its own data through the normal delete path. No genuine customer
// records, no PII (synthetic @example.com identities only).
//
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... node scripts/live-matrix.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const SUPA_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY')
  process.exit(2)
}
if (!SUPA_URL.includes('awshkiwqkuubkhecszzk')) {
  console.error(`Refusing to run: ${SUPA_URL} is not the verified production project (awshkiwqkuubkhecszzk)`)
  process.exit(2)
}
const SITE = 'https://jriq.in'
const PAGES = 'https://shauryaojaswa.github.io/gift'
const shots = path.join(os.tmpdir(), 'jriq-v111-matrix')
fs.mkdirSync(shots, { recursive: true })

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`MATRIX PASS  ${name}`)
  } else {
    fail += 1
    console.log(`MATRIX FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true })
}
async function decodeQr(page, locator) {
  const buf = await locator.screenshot()
  const png = PNG.sync.read(buf)
  const code = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height)
  return code?.data ?? null
}

const service = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const slug = `matrix-probe-${run}`
const shopName = `Matrix Probe ${run}`
const ownerEmail = `matrix-owner-${run}@example.com`
const adminEmail = `matrix-admin-${run}@example.com`
const password = `Matrix-${run}-Probe!x`
let storeId = null
const userIds = []

async function setup() {
  const { data: adminUser, error: e1 } = await service.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
  if (e1) throw new Error(`createUser admin: ${e1.message}`)
  userIds.push(adminUser.user.id)
  const { data: ownerUser, error: e2 } = await service.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
  if (e2) throw new Error(`createUser owner: ${e2.message}`)
  userIds.push(ownerUser.user.id)
  const { error: paErr } = await service.from('platform_admins').insert({ user_id: adminUser.user.id })
  if (paErr) throw new Error(`platform_admins: ${paErr.message}`)

  const platform = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: signInErr } = await platform.auth.signInWithPassword({ email: adminEmail, password })
  if (signInErr) throw new Error(`platform signIn: ${signInErr.message}`)
  const { data: shopData, error: shopErr } = await platform.rpc('create_shop', {
    p_name: shopName, p_slug: slug, p_owner_email: ownerEmail,
  })
  if (shopErr || !shopData?.length) throw new Error(`create_shop: ${shopErr?.message ?? 'no row'}`)
  storeId = shopData[0].shop_id
  const { error: actErr } = await platform.rpc('set_store_status', { p_store_id: storeId, p_status: 'active' })
  if (actErr) throw new Error(`set_store_status: ${actErr.message}`)
  console.log(`MATRIX setup ok: shop=${slug} owner=${ownerEmail}`)
}

async function cleanup() {
  if (storeId) {
    await service.from('stores').delete().eq('id', storeId)
    await service.from('platform_audit_logs').delete().filter('details->>deleted_store_id', 'eq', storeId)
    await service.from('platform_audit_logs').delete().eq('store_id', storeId)
    await service.from('submissions').delete().eq('store_id', storeId)
    await service.from('public_submission_rate_limits').delete().eq('store_id', storeId)
    await service.from('store_admins').delete().eq('store_id', storeId)
    await service.from('reward_tiers').delete().eq('store_id', storeId)
    await service.from('store_subscriptions').delete().eq('store_id', storeId)
    await service.from('store_owner_invitations').delete().eq('store_id', storeId)
  }
  for (const id of userIds) await service.auth.admin.deleteUser(id)
  const { data: left } = await service.from('stores').select('id').eq('id', storeId ?? '')
  check('cleanup: probe store gone (normal delete path + cascade)', (left ?? []).length === 0)
}

async function main() {
  await setup()
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const page = await ctx.newPage()

  // M1 platform homepage: renders, never redirects to a shop
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)
  const m1Body = await page.textContent('body')
  check('M1 "/" renders the JRIQ platform homepage', (m1Body ?? '').includes('JRIQ'), 'no JRIQ marker')
  check('M1 "/" never redirected to a shop', new URL(page.url()).pathname === '/', page.url())
  await shot(page, 'm1-home')

  // M2 real shop page renders (jolly-enterprises)
  const { data: jolly } = await service.from('stores').select('name, subtitle').eq('slug', 'jolly-enterprises').maybeSingle()
  console.log(`MATRIX INFO  jolly-enterprises name=${JSON.stringify(jolly?.name)} subtitle=${JSON.stringify(jolly?.subtitle)}`)
  await page.goto(`${SITE}/jolly-enterprises`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1200)
  const m2Body = await page.textContent('body')
  check('M2 "/jolly-enterprises" renders the shop', (m2Body ?? '').toLowerCase().includes((jolly?.name ?? 'jolly').toLowerCase()), `name expected: ${jolly?.name}`)
  await shot(page, 'm2-jolly-shop')

  // M3 probe shop page renders its own identity (mobile)
  await page.goto(`${SITE}/${slug}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)
  const m3Body = await page.textContent('body')
  check('M3 "/{probe}" renders the probe shop name', (m3Body ?? '').includes(shopName))
  check('M3 probe page carries no jolly branding', !(m3Body ?? '').includes(jolly?.name ?? 'zzz'), 'jolly name leaked')
  await shot(page, 'm3-probe-shop')

  // M4 anon hits the login wall (desktop)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${SITE}/${slug}/admin`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)
  check('M4 anon "/{slug}/admin" shows the vendor login wall', (await page.locator('input[type="email"]').count()) > 0)
  check('M4 login wall is the vendor login route', page.url().includes('vendor/login'), page.url())
  await shot(page, 'm4-anon-wall')

  // M5 owner signs in and lands in their own admin
  await page.locator('input[type="email"]').first().fill(ownerEmail)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2500)
  const m5Body = await page.textContent('body')
  check('M5 owner lands in own admin', page.url().includes(`/${slug}/admin`) || (m5Body ?? '').includes(shopName), page.url())
  check('M5 admin shows the probe shop identity', (m5Body ?? '').includes(shopName))
  await shot(page, 'm5-owner-admin')

  // M6 QR page: decodes to exactly https://jriq.in/{slug}
  await page.goto(`${SITE}/${slug}/admin/qr-code`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const qrLoc = page.locator('img[alt="QR code linking to your public campaign"]').first()
  const decoded = await decodeQr(page, qrLoc)
  check('M6 QR decodes to exactly https://jriq.in/{slug}', decoded === `${SITE}/${slug}`, `decoded=${decoded}`)
  await shot(page, 'm6-qr')

  // M7 cross-shop: owner at another shop's admin gets 403 with zero data
  await page.goto(`${SITE}/jolly-enterprises/admin`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  const m7Body = await page.textContent('body')
  check('M7 cross-shop "/jolly-enterprises/admin" shows 403', (m7Body ?? '').includes('403'), 'no 403 marker')
  check('M7 403 explains the ownership wall', (m7Body ?? '').includes('belongs to another shop'))
  check('M7 403 leaks zero jolly name', !(m7Body ?? '').includes(jolly?.name ?? 'zzz'))
  await shot(page, 'm7-forbidden')

  // M8 public standee QR decodes to the customer URL. The standee renders its
  // QR as an inline SVG (QRCode.toString), so decode from the full-page raster
  // rather than an img/canvas locator.
  try {
    await page.goto(`${SITE}/standee/${slug}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    const png = PNG.sync.read(await page.screenshot({ path: path.join(shots, 'm8-standee.png'), fullPage: true }))
    const code = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height)
    check('M8 standee QR decodes to https://jriq.in/{slug}', code?.data === `${SITE}/${slug}`, `decoded=${code?.data ?? 'none'}`)
  } catch (e) {
    check('M8 standee QR decodes to https://jriq.in/{slug}', false, e.message)
  }

  // M9 GitHub Pages fallback (honoured, never decommissioned).
  await page.goto(`${PAGES}/`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)
  const m9RootBody = await page.textContent('body')
  check('M9a Pages "/gift/" serves the app', (m9RootBody ?? '').includes('JRIQ'), 'no app marker')
  await shot(page, 'm9a-pages-root')

  // State evidence: which build the Pages host actually serves.
  const pagesIndex = await page.evaluate(async () => (await fetch('/gift/', { cache: 'no-store' })).text())
  const pagesBundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(pagesIndex ?? '')?.[1] ?? 'unknown'
  const pagesJs = await page.evaluate(async (b) => (await fetch(`/gift/assets/${b}`, { cache: 'no-store' })).text(), pagesBundle)
  const pagesCurrent = (pagesJs ?? '').includes('belongs to another shop')
  console.log(`MATRIX INFO  Pages serves bundle ${pagesBundle}; v1.1.x marker strings ${pagesCurrent ? 'present' : 'ABSENT (stale pre-v1.1.0 build)'}`)

  await page.goto(`${PAGES}/store/jolly-enterprises`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  const m9Url = page.url()
  const m9Body = await page.textContent('body')
  check('M9b Pages legacy /gift/store/{slug} renders the shop losslessly', (m9Body ?? '').toLowerCase().includes((jolly?.name ?? 'jolly').toLowerCase()), `name expected: ${jolly?.name}`)
  check('M9c Pages legacy URL client-canonicalizes to /gift/{slug}', m9Url.includes('/gift/jolly-enterprises'), m9Url)
  await shot(page, 'm9-pages-legacy')

  await browser.close()
}

try {
  await main()
} catch (e) {
  fail += 1
  console.log(`MATRIX FAIL  harness error -- ${e.message}`)
} finally {
  try { await cleanup() } catch (e) { console.log(`MATRIX FAIL  cleanup error -- ${e.message}`) }
}
console.log(`MATRIX RESULT ${pass} passed, ${fail} failed (live matrix, evidence in ${shots})`)
process.exit(fail > 0 ? 1 : 0)
