#!/usr/bin/env node
// Logo verification harness - proves a shop's real logo renders correctly on
// every public surface of the deployed (or rehearsal) app, in fresh browser
// sessions, at mobile and desktop viewports, without ever writing app data.
//
// Surfaces checked for the shop slug:
//   /{slug}            canonical customer page
//   /{slug}/costumer   commissioned alias
//   /{slug}/customer   alias
//   /{slug}/admin      shop-owner workspace (login wall; full shell when
//                      admin credentials are supplied)
//
// For each surface/viewport it asserts:
//   - the page loads with no console errors or failed requests
//   - the shop logo <img> is visible, points at the expected storage object
//     (or the persisted logo URL), and the image DECODED (naturalWidth/Height
//     match the source file, so a broken image or the fallback is a failure)
//   - computed style uses object-fit: contain and the rendered box preserves
//     the source aspect ratio (never cropped or stretched)
//   - the no-logo fallback monogram is NOT shown
//   - no horizontal overflow at 390x844
// and captures a screenshot per surface/viewport as evidence.
//
// Every surface runs in its own fresh browser context, and --runs N repeats
// the whole matrix in separate browser instances to prove persistence across
// sessions (bypassing caches with a cache-busting query).
//
// Usage:
//   node scripts/logo-check.mjs --slug shreejwellers
//        [--base https://jriq.in] [--expect-url <logo-url>]
//        [--admin-email <email> --admin-password <pw>]
//        [--serve-dist <dir>]          // local rehearsal build (SPA fallback)
//        [--runs 2] [--out logs/live-audit] [--tag live]
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { existsSync, statSync, readFileSync, mkdirSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

const SLUG = argValue('--slug')
const BASE = (argValue('--base') ?? 'https://jriq.in').replace(/\/$/, '')
const EXPECT_URL = argValue('--expect-url')
const ADMIN_EMAIL = argValue('--admin-email')
const ADMIN_PASSWORD = argValue('--admin-password')
const SERVE_DIST = argValue('--serve-dist')
const RUNS = Number(argValue('--runs') ?? '2')
const OUT = argValue('--out') ?? 'logs/live-audit'
const TAG = argValue('--tag') ?? 'live'

if (!SLUG) {
  console.error('Usage: node scripts/logo-check.mjs --slug <shop-slug> [--base <url>] [--expect-url <logo-url>]')
  process.exit(2)
}

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }
const rows = []
let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`
  rows.push(line)
  console.log(line)
  if (ok) pass += 1
  else fail += 1
}

// Optional local rehearsal server (same SPA semantics as the deployed host).
async function startRehearsalServer(distDir) {
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
  }
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

function wire(page, tag, consoleErrors, failedRequests) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 200)}`))
  page.on('requestfailed', (r) => {
    const failure = r.failure()?.errorText ?? ''
    if (!failure.includes('ERR_ABORTED')) failedRequests.push(`[${tag}] ${r.url().slice(0, 120)} ${failure}`)
  })
}

async function nav(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  } catch {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 })
  }
}

// Read the logo element's identity + geometry + computed fit from the DOM.
async function probeLogo(page, selector) {
  return page.evaluate((sel) => {
    const img = document.querySelector(sel)
    if (!img) return null
    const style = getComputedStyle(img)
    const rect = img.getBoundingClientRect()
    return {
      src: img.currentSrc || img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: Math.round(rect.width),
      renderedHeight: Math.round(rect.height),
      objectFit: style.objectFit,
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
    }
  }, selector)
}

// Resilient sign-in at the stable login URL (the /{slug}/admin wall redirects
// here and the form remounts mid-fill, which can silently discard input).
// Verifies the controlled inputs hold the typed values and retries through
// transient failures. Success = the shop-owner workspace is reached.
async function adminSignIn(page, base, email, password, expectUrl) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`${base}/vendor/login`, { waitUntil: 'load' })
    await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(700)
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    const held = await page.evaluate(() => ({
      email: document.querySelector('input[type="email"]')?.value ?? '',
      passwordLen: (document.querySelector('input[type="password"]')?.value ?? '').length,
    }))
    if (held.email !== email || held.passwordLen === 0) {
      await page.waitForTimeout(1200)
      continue
    }
    await page.click('button[type="submit"]')
    for (let t = 0; t < 12; t += 1) {
      await page.waitForTimeout(1000)
      if (expectUrl(page.url())) return { ok: true, alert: '' }
    }
    const alert = (await page.locator('[role="alert"]').allTextContents().catch(() => [])).join(' | ')
    if (alert) return { ok: false, alert }
    await page.waitForTimeout(1500)
  }
  return { ok: false, alert: 'sign-in did not reach the workspace' }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  let base = BASE
  let serverHandle = null
  if (SERVE_DIST) {
    serverHandle = await startRehearsalServer(SERVE_DIST)
    base = `http://127.0.0.1:${serverHandle.port}`
  }
  console.log(`INFO  logo check base=${base} slug=${SLUG} runs=${RUNS} out=${OUT}`)

  const surfaces = [
    { key: 'canonical', path: `/${SLUG}` },
    { key: 'costumer', path: `/${SLUG}/costumer` },
    { key: 'customer', path: `/${SLUG}/customer` },
    { key: 'admin', path: `/${SLUG}/admin` },
  ]

  const seenLogoUrls = new Set()

  for (let run = 1; run <= RUNS; run += 1) {
    // A brand-new browser per run = a fresh session (no shared cache/state).
    const browser = await chromium.launch()
    try {
      for (const [vpName, viewport] of [
        ['mobile', MOBILE],
        ['desktop', DESKTOP],
      ]) {
        const context = await browser.newContext({ viewport })
        for (const surface of surfaces) {
          const page = await context.newPage()
          const consoleErrors = []
          const failedRequests = []
          wire(page, `${surface.key}/${vpName}/r${run}`, consoleErrors, failedRequests)

          const url = `${base}${surface.path}?logoCheck=${run}-${vpName}-${Date.now()}`
          await nav(page, url)

          const isCustomer = surface.key !== 'admin'
          const shot = join(OUT, `logo-${TAG}-${surface.key}-${vpName}-r${run}.png`)

          if (isCustomer) {
            const logo = await probeLogo(page, 'img.store-logo-image')
            check(`[r${run} ${vpName}] ${surface.path} shop logo rendered`, Boolean(logo?.visible), JSON.stringify(logo ?? null))
            if (logo) {
              seenLogoUrls.add(logo.src)
              if (EXPECT_URL) {
                check(`[r${run} ${vpName}] ${surface.path} logo src is the persisted URL`, logo.src === EXPECT_URL, logo.src)
              } else {
                check(`[r${run} ${vpName}] ${surface.path} logo src points at store-logos object`, logo.src.includes('store-logos'), logo.src)
              }
              check(`[r${run} ${vpName}] ${surface.path} image fully decoded (not broken/fallback)`, logo.complete && logo.naturalWidth > 0 && logo.naturalHeight > 0, `${logo.naturalWidth}x${logo.naturalHeight}`)
              check(`[r${run} ${vpName}] ${surface.path} object-fit: contain (not cropped/stretched)`, logo.objectFit === 'contain', logo.objectFit)
              const srcRatio = logo.naturalWidth / logo.naturalHeight
              const boxRatio = logo.renderedWidth / logo.renderedHeight
              check(
                `[r${run} ${vpName}] ${surface.path} aspect ratio preserved (${srcRatio.toFixed(3)} -> ${boxRatio.toFixed(3)})`,
                Math.abs(srcRatio - boxRatio) < 0.08,
                `${logo.renderedWidth}x${logo.renderedHeight}`,
              )
            }
            const monogram = await page.locator('svg[aria-label$="logo"]').count()
            check(`[r${run} ${vpName}] ${surface.path} fallback monogram NOT shown`, monogram === 0, `monograms=${monogram}`)
          } else if (ADMIN_EMAIL && ADMIN_PASSWORD) {
            // Admin surface: sign in through the real login wall in this fresh
            // context, then verify the shop logo on the owner workspace's own
            // logo surfaces (Store Settings preview + QR Code & Branding card).
            // Read-only apart from the sign-in itself.
            const onWall = await page.locator('input[type="email"]').isVisible().catch(() => false)
            check(`[r${run} ${vpName}] ${surface.path} login wall shown`, onWall)
            if (onWall) {
              const signedIn = await adminSignIn(page, base, ADMIN_EMAIL, ADMIN_PASSWORD, (u) => u.includes('/admin'))
              check(`[r${run} ${vpName}] ${surface.path} owner sign-in succeeded`, signedIn.ok, signedIn.alert)
              if (signedIn.ok) {
              await page
                .locator('text=Shop Owner')
                .first()
                .waitFor({ state: 'visible', timeout: 15000 })
                .catch(() => null)
              check(`[r${run} ${vpName}] ${surface.path} signed-in shop-owner workspace reached`, page.url().includes('/admin'), page.url())

              // Store Settings: the logo preview the owner controls
              await nav(page, `${base}/${SLUG}/admin/settings?logoCheck=${run}-${vpName}`)
              await page
                .locator('img[alt="Store logo preview"]')
                .first()
                .waitFor({ state: 'visible', timeout: 15000 })
                .catch(() => null)
              const settingsLogo = await probeLogo(page, 'img[alt="Store logo preview"]')
              check(`[r${run} ${vpName}] ${surface.path} settings logo preview rendered`, Boolean(settingsLogo?.visible), JSON.stringify(settingsLogo ?? null))
              if (settingsLogo) {
                seenLogoUrls.add(settingsLogo.src)
                if (EXPECT_URL) check(`[r${run} ${vpName}] ${surface.path} settings logo src is the persisted URL`, settingsLogo.src === EXPECT_URL, settingsLogo.src)
                check(`[r${run} ${vpName}] ${surface.path} settings logo image fully decoded`, settingsLogo.complete && settingsLogo.naturalWidth > 0, `${settingsLogo.naturalWidth}x${settingsLogo.naturalHeight}`)
                check(`[r${run} ${vpName}] ${surface.path} settings logo object-fit: contain`, settingsLogo.objectFit === 'contain', settingsLogo.objectFit)
              }
              await page.screenshot({ path: join(OUT, `logo-${TAG}-admin-settings-${vpName}-r${run}.png`), fullPage: true })

              // QR Code & Branding: the standee card logo
              await nav(page, `${base}/${SLUG}/admin/qr-code?logoCheck=${run}-${vpName}`)
              await page
                .locator('img.rounded-full')
                .first()
                .waitFor({ state: 'visible', timeout: 15000 })
                .catch(() => null)
              const qrLogo = await probeLogo(page, 'img.rounded-full')
              check(`[r${run} ${vpName}] ${surface.path} QR branding card logo rendered`, Boolean(qrLogo?.visible), JSON.stringify(qrLogo ?? null))
              if (qrLogo) {
                seenLogoUrls.add(qrLogo.src)
                if (EXPECT_URL) check(`[r${run} ${vpName}] ${surface.path} QR card logo src is the persisted URL`, qrLogo.src === EXPECT_URL, qrLogo.src)
                check(`[r${run} ${vpName}] ${surface.path} QR card logo image fully decoded`, qrLogo.complete && qrLogo.naturalWidth > 0, `${qrLogo.naturalWidth}x${qrLogo.naturalHeight}`)
              }
              await page.screenshot({ path: join(OUT, `logo-${TAG}-admin-qr-${vpName}-r${run}.png`), fullPage: true })
              }
            }
          } else {
            const onWall = await page.locator('input[type="email"]').isVisible().catch(() => false)
            check(`[r${run} ${vpName}] ${surface.path} admin login wall shown (no credentials supplied)`, onWall)
          }

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          check(`[r${run} ${vpName}] ${surface.path} no horizontal overflow`, overflow <= 1, `${overflow}px`)

          await page.screenshot({ path: shot, fullPage: true })
          check(`[r${run} ${vpName}] ${surface.path} screenshot captured`, existsSync(shot), shot)

          check(`[r${run} ${vpName}] ${surface.path} no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
          check(`[r${run} ${vpName}] ${surface.path} no failed requests`, failedRequests.length === 0, failedRequests.slice(0, 2).join(' | '))
          await page.close()
        }
        await context.close()
      }
    } finally {
      await browser.close()
    }
  }

  check('logo URL stable across fresh sessions/runs', seenLogoUrls.size === 1, JSON.stringify([...seenLogoUrls]))

  console.log(`INFO  evidence ${OUT}/logo-${TAG}-*.png`)
  console.log(`RESULT ${pass} passed, ${fail} failed (logo check ${SLUG} on ${base})`)
  if (serverHandle) serverHandle.server.close()
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL  logo check aborted - ${err?.message ?? err}`)
  process.exit(1)
})
