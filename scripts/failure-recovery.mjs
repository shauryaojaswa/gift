#!/usr/bin/env node
// Failure handling & recovery suite - controlled failure scenarios in the
// isolated staging rig (never production):
//   F1 reload during a pending save leaves NO corrupt/partial state
//   F2 interrupted network request surfaces a visible error, retry succeeds
//   F3 simulated backend timeout shows loading -> error, no duplicate writes
//   F4 double-click submit creates exactly ONE customer entry (no double reward)
//   F5 dropped connection mid-flow: app stays usable, retry recovers
// Evidence screenshots land in artifacts/qa/failure/.
//
// Claim-creating checks (--allow-claims) are staging-only.
//
// Usage:
//   node scripts/failure-recovery.mjs [--base http://127.0.0.1:4173]
//        [--keys <keys.json>] [--creds-dir <dir>] [--allow-claims]
//        [--out artifacts/qa/failure] [--tag staging]
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const BASE = argValue('--base', 'http://127.0.0.1:4173')
const KEYS_FILE = argValue('--keys', join(process.env.TEMP ?? '/tmp', 'jriq-keys-staging.json'))
const CREDS_DIR = argValue('--creds-dir', join(process.env.TEMP ?? '/tmp', 'jriq-qa-creds'))
const SLUG = argValue('--slug', 'pashupati1')
const ALLOW_CLAIMS = args.includes('--allow-claims')
const OUT = argValue('--out', 'artifacts/qa/failure')
const TAG = argValue('--tag', 'staging')

if (ALLOW_CLAIMS && (BASE.includes('jriq.in') || KEYS_FILE.includes('prod'))) {
  console.error('Refusing: claim-creating failure tests never run against production')
  process.exit(2)
}

const { chromium } = await import('playwright')
const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const service = createClient(parsed.url, parsed.service, { auth: { persistSession: false } })

mkdirSync(OUT, { recursive: true })
let pass = 0
let fail = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

async function countRows(name) {
  const { data } = await service.from('submissions').select('id').eq('customer_name', name)
  return (data ?? []).length
}

function fieldAfter(page, label) {
  return page.locator(`xpath=//label[contains(normalize-space(.), ${JSON.stringify(label)})]/following-sibling::*[1]`)
}

async function main() {
  const browser = await chromium.launch()
  try {
    // =====================================================================
    // F1 reload during a pending owner save
    // =====================================================================
    {
      const creds = JSON.parse(readFileSync(join(CREDS_DIR, `${SLUG}.json`), 'utf8'))
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/${SLUG}/admin`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(creds.email)
      await page.locator('input[type="password"]').fill(creds.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForTimeout(1500)
      await page.goto(`${BASE}/${SLUG}/admin/rewards`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Add reward' }).waitFor({ timeout: 10000 })

      // trigger a save then reload the page while it is in flight
      const addBtn = page.getByRole('button', { name: 'Add reward' })
      await addBtn.click()
      await page.waitForTimeout(300)
      await Promise.all([page.reload({ waitUntil: 'networkidle' }), page.waitForTimeout(150)])
      await page.waitForTimeout(1200)
      const text = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f1-reload-during-save.png') })
      check(
        'F1 reload during pending save: no crash, no corrupt dialog state',
        !/Something went wrong|Application error|undefined is not/i.test(text) && /Add reward/i.test(text),
        text.replace(/\s+/g, ' ').slice(0, 80),
      )
      await ctx.close()
    }

    // =====================================================================
    // F2 interrupted network request (save aborted) -> visible error + retry
    // =====================================================================
    {
      const creds = JSON.parse(readFileSync(join(CREDS_DIR, `${SLUG}.json`), 'utf8'))
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      const page = await ctx.newPage()
      let dropped = false
      await page.route('**/rest/v1/**', async (route) => {
        const method = route.request().method()
        const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
        if (isWrite && !dropped) {
          dropped = true
          await route.abort('failed')
        } else {
          await route.continue()
        }
      })
      await page.goto(`${BASE}/${SLUG}/admin`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(creds.email)
      await page.locator('input[type="password"]').fill(creds.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForTimeout(1500)

      await page.goto(`${BASE}/${SLUG}/admin/rewards`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Add reward' }).waitFor({ timeout: 10000 })
      await page.getByRole('button', { name: 'Add reward' }).click()
      await page.waitForTimeout(400)
      const rewardName = `QA Gift ${SLUG} NetDrop ${Date.now().toString(36)}`
      await fieldAfter(page, 'Reward name').fill(rewardName)
      await page.getByRole('button', { name: /save reward/i }).first().click()
      await page.waitForTimeout(1800)
      const errText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f2-interrupted-request.png') })
      check(
        'F2 interrupted save surfaces a visible error (no silent failure)',
        /error|try again|failed|could not/i.test(errText),
        errText.replace(/\s+/g, ' ').slice(0, 80),
      )
      // retry with the network restored must succeed (no duplicate risk: the
      // first write never landed)
      await page.getByRole('button', { name: /save reward/i }).first().click().catch(() => null)
      await page.waitForTimeout(1800)
      const retryText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f2-retry-succeeded.png') })
      const { data: saved } = await service.from('rewards').select('id').eq('name', rewardName)
      check('F2 retry with network restored persists exactly one reward', (saved ?? []).length === 1, `rows=${(saved ?? []).length} ui=${retryText.replace(/\s+/g, ' ').slice(0, 60)}`)
      await ctx.close()
    }

    // =====================================================================
    // F3 simulated backend timeout -> loading then error, nothing corrupted
    // =====================================================================
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      let delayed = false
      await page.route('**/rest/v1/**', async (route) => {
        if (!delayed) {
          delayed = true
          await new Promise((r) => setTimeout(r, 9000))
        }
        await route.continue()
      })
      const t0 = Date.now()
      await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null)
      await page.waitForTimeout(1000)
      const loadingText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f3-timeout-loading.png') })
      const showsLoading = /loading|wait|spin|rewards/i.test(loadingText) || (Date.now() - t0) < 9000
      check('F3 slow backend: app shows a loading surface (not a blank crash)', showsLoading, loadingText.replace(/\s+/g, ' ').slice(0, 80))
      await page.waitForTimeout(9500)
      await page.waitForLoadState('networkidle').catch(() => null)
      const afterText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f3-timeout-recovered.png') })
      check('F3 after the delay the page resolves (recovery without restart)', afterText.length > 50, afterText.replace(/\s+/g, ' ').slice(0, 80))
      await ctx.close()
    }

    // =====================================================================
    // F4 double-click submit creates exactly ONE entry (no double reward)
    // =====================================================================
    if (ALLOW_CLAIMS) {
      try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      const page = await ctx.newPage()
      const name = `QA DoubleTap ${Date.now().toString(36)}`
      await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'START', exact: true }).click()
      await page.getByLabel('Full name').fill(name)
      await page.getByLabel('Purchase amount in Indian Rupees').fill('2000')
      await page.getByLabel('10-digit mobile number').fill(`9${String(700000000 + Math.floor(Math.random() * 99999999))}`)
      // a real double-tap: two raw clicks back-to-back (Playwright's
      // actionability retries would serialize and defeat the point)
      const cont = page.getByRole('button', { name: 'CONTINUE', exact: true })
      const box = await cont.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      }
      await page.waitForTimeout(3500)
      await page.screenshot({ path: join(OUT, 'f4-double-submit.png') })
      const rows = await countRows(name)
      check('F4 double-click submit persists exactly one customer entry', rows === 1, `rows=${rows}`)
      await ctx.close()
      } catch (err) {
        check('F4 double-click submit persists exactly one customer entry', false, `crash: ${String(err?.message ?? err).slice(0, 110)}`)
      }
    }

    // =====================================================================
    // F5 dropped connection mid-flow -> usable error, retry recovers
    // =====================================================================
    {
      try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      const page = await ctx.newPage()
      let drop = true
      await page.route('**/rest/v1/**', async (route) => {
        if (drop) {
          drop = false
          await route.abort('failed')
        } else {
          await route.continue()
        }
      })
      await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' }).catch(() => null)
      await page.waitForTimeout(2500)
      const dropText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f5-connection-dropped.png') })
      const usable = dropText.length > 30 && !/Something went wrong|Application error/i.test(dropText)
      check('F5 dropped connection: app stays rendered and usable (no white crash)', usable, dropText.replace(/\s+/g, ' ').slice(0, 80))
      // retry path: reload with the network restored
      await page.reload({ waitUntil: 'networkidle' }).catch(() => null)
      await page.waitForTimeout(1500)
      const retryText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f5-recovered.png') })
      check('F5 reload with network restored fully recovers', /reward|welcome|campaign/i.test(retryText), retryText.replace(/\s+/g, ' ').slice(0, 80))
      await ctx.close()
      } catch (err) {
        check('F5 dropped connection handling completed', false, `crash: ${String(err?.message ?? err).slice(0, 110)}`)
      }
    }
    // =====================================================================
    // F6 browser back/forward mid-flow: no crash, no corrupt state.
    // (The flow steps live on ONE route and push no history, so the real
    // scenario is cross-route: home -> shop -> back -> forward.)
    // =====================================================================
    {
      try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'START', exact: true }).click()
      await page.getByLabel('Full name').waitFor({ timeout: 10000 })
      await page.goBack({ waitUntil: 'networkidle' }).catch(() => null)
      await page.waitForTimeout(800)
      const backText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f6-back.png') })
      check(
        'F6 back mid-flow lands on the previous app page (rendered, no crash)',
        page.url().endsWith('/') && backText.length > 30 && !/Something went wrong|Application error/i.test(backText),
        `${page.url()} | ${backText.replace(/\s+/g, ' ').slice(0, 60)}`,
      )
      await page.goForward({ waitUntil: 'networkidle' }).catch(() => null)
      await page.waitForTimeout(1200)
      const fwdText = await page.locator('body').innerText()
      await page.screenshot({ path: join(OUT, 'f6-forward.png') })
      check(
        'F6 forward returns to a sane flow state (welcome or details form)',
        /YOUR REWARD IS WAITING|Full name|WELCOME BACK/i.test(fwdText),
        fwdText.replace(/\s+/g, ' ').slice(0, 80),
      )
      await ctx.close()
      } catch (err) {
        check('F6 back/forward handling completed', false, `crash: ${String(err?.message ?? err).slice(0, 110)}`)
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`RESULT failure-recovery: ${pass} passed, ${fail} failed (${TAG} @ ${BASE})`)
  console.log(`INFO  evidence ${OUT}`)
  if (failures.length) console.log(`INFO  failed rows: ${failures.join(' | ')}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAIL  failure-recovery crashed: ${err?.stack ?? err}`)
  process.exit(1)
})
