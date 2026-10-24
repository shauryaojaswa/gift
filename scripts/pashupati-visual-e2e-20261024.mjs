#!/usr/bin/env node
// 2026-10-24: visual/admin E2E for the three reconfigured Pashupati stores.
// Phase A: owner sign-in -> Campaign panel text dump + screenshot (admin view
//          of the 10 rewards + 10 tier ranges).
// Phase B: customer journey on the live site -> spin -> YOU WON requirement
//          screenshot. Expected reward per store from the approved ladder.
// No secrets printed; creds read from the temp credentials file.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')

const BASE = 'https://jriq.in'
const CREDS = JSON.parse(readFileSync(join(tmpdir(), 'jriq-pashupati-owner-credentials.json'), 'utf8'))
const OUT = 'artifacts/pashupati-e2e-20261024'
mkdirSync(OUT, { recursive: true })

const STORES = [
  { slug: 'pashupati1', amount: 30000, expect: 'CUP SET', phone: '9801223366', name: 'Pashupati1 E2E Check', invoice: 'P1-E2E-01' },
  { slug: 'pashupati2', amount: 62500, expect: 'VARMORA TIFFIN', phone: '9801223356', name: 'Pashupati2 E2E Ride', invoice: 'P2-E2E-03' },
  { slug: 'pashupati', amount: 325000, expect: 'IRON', phone: '9801223357', name: 'Pashupati E2E Ride', invoice: 'P0-E2E-02' },
]
const LOGIN_FIELD = 'input[autocomplete="username"], input[type="email"]'
const log = (s) => process.stdout.write(s + '\n')

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
const notes = {}

const ADMIN_ONLY = process.env.ADMIN_ONLY === '1'

for (const store of STORES) {
  const findings = {}
  try {
    // -------- Phase A: admin panel display --------
    await page.goto(`${BASE}/${store.slug}/admin`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(LOGIN_FIELD, { timeout: 20000 })
    await page.locator(LOGIN_FIELD).first().fill(CREDS[store.slug].adminId ?? CREDS[store.slug].email)
    await page.locator('input[type="password"]').first().fill(CREDS[store.slug].password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForSelector('nav[aria-label="Vendor navigation"]', { timeout: 30000 })
    await page.getByRole('link', { name: 'Rewards & Tiers' }).first().click()
    await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
    await page.waitForTimeout(1200)
    const adminText = await page.evaluate(() => document.body.innerText)
    findings.adminHasRewardsHeading = /REWARDS|CAMPAIGN/i.test(adminText)
    // count the tier range rows shown in the Campaign panel
    const tierRows = (adminText.match(/₹\s?[\d,]+(?:\s?–\s?₹\s?[\d,+]+)?(?:\+)?/g) || []).length
    // explicit display of the approved tier ranges
    const hasRanges = ['0', '24,999', '49,999', '99,999', '1,99,999', '2,99,999', '6,99,999', '1,00,00,000']
      .map((s) => adminText.includes(s))
    await page.screenshot({ path: join(OUT, `${store.slug}-admin.png`), fullPage: true })
    writeFileSync(join(OUT, `${store.slug}-admin.txt`), adminText)
    log(`${store.slug} ADMIN: rangesFound=${hasRanges.filter(Boolean).length}/8 rawTierTokens=${tierRows}`)
    // sign out for the next store
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
    await page.context().clearCookies()

    if (ADMIN_ONLY) { notes[store.slug] = { adminRangesFound: hasRanges.filter(Boolean).length }; continue }

    // -------- Phase B: customer journey --------
    await page.goto(`${BASE}/${store.slug}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'START' }).click()
    await page.waitForSelector('#full-name', { timeout: 20000 })
    await page.fill('#full-name', store.name)
    await page.fill('#purchase-amount', String(store.amount))
    await page.fill('#phone-number', store.phone)
    const inv = page.locator('#invoice-details')
    if (await inv.count()) await inv.fill(store.invoice)
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
    // review step (may take a moment); continue to spin
    await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).waitFor({ timeout: 25000 })
    await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).click()
    // spin
    await page.waitForSelector('button.spin-center', { timeout: 25000 })
    await page.locator('button.spin-center').click()
    // wait for the landing
    await page.waitForFunction(() => document.body.innerText.includes('YOU WON'), null, { timeout: 40000 })
    const rewardText = await page.evaluate(() => {
      const t = document.body.innerText
      return t.slice(t.indexOf('YOU WON'), t.indexOf('YOU WON') + 320)
    })
    const ok = rewardText.includes(store.expect) && /[A-Z]{2,8}-[A-F0-9]{8}/.test(rewardText)
    await page.screenshot({ path: join(OUT, `${store.slug}-reward.png`), fullPage: true })
    log(`${store.slug} RIDE: ${ok ? 'PASS' : 'FAIL'} expect=${store.expect} got=${rewardText.split('\n')[1]} code=${(rewardText.match(/[A-Z]{2,8}-[A-F0-9]{8}/) || ['?'])[0]}`)
    // thank-you screen
    const cont = page.getByRole('button', { name: 'CONTINUE', exact: true })
    if (await cont.count()) await cont.first().click()
    await page.waitForTimeout(800)
    const tyText = await page.evaluate(() => document.body.innerText.slice(0, 400))
    writeFileSync(join(OUT, `${store.slug}-thankyou.txt`), tyText)
    await page.screenshot({ path: join(OUT, `${store.slug}-thankyou.png`), fullPage: true })
    findings.ok = ok
  } catch (e) {
    log(`${store.slug} ERROR: ${e.message.slice(0, 200)}`)
    findings.error = e.message
  }
  notes[store.slug] = findings
}

await browser.close()
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(notes, null, 2))
log('DONE ' + JSON.stringify(Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, !!v.ok]))))
