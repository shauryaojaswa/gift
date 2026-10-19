#!/usr/bin/env node
// Performance & lag audit - measured, not "feels fine".
//
// Phases (all while the preview server + Supabase backend are serving):
//   vitals     - TTFB / FCP / LCP / CLS / long tasks per key page (baseline)
//   browserload- N parallel customers browsing the four shops at once
//   apiramp    - submit_customer_entry + read throughput ramp (1/8/32/64)
//   sustained  - 60s continuous mixed load (degradation / leak signal)
//   resources  - CPU / RAM samples of the local runtime around each phase
//
// Web thresholds are PROPOSED (labelled as such in the report): LCP <= 2.5s,
// CLS <= 0.1, API p95 <= 1.0s on staging, error rate <= 1%.
//
// Claim-creating load (--allow-claims) is staging-only and refuses production.
//
// Usage:
//   node scripts/perf-audit.mjs [--base http://127.0.0.1:4173]
//        [--keys <keys.json>] [--slugs a,b,c,d] [--allow-claims]
//        [--out artifacts/qa/perf] [--tag staging]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const BASE = argValue('--base', 'http://127.0.0.1:4173')
const KEYS_FILE = argValue('--keys', join(process.env.TEMP ?? '/tmp', 'jriq-keys-staging.json'))
const SLUGS = (argValue('--slugs', 'pashupati1,pashupati2,pashupati,shreemanali')).split(',').map((s) => s.trim())
const ALLOW_CLAIMS = args.includes('--allow-claims')
const OUT = argValue('--out', 'artifacts/qa/perf')
const TAG = argValue('--tag', 'staging')
const SUSTAINED_SECONDS = Number(argValue('--sustained-seconds', '60'))
const ONLY_PHASES = argValue('--phases', '')
function wanted(name) {
  return !ONLY_PHASES || ONLY_PHASES.split(',').map((s) => s.trim()).includes(name)
}

if (ALLOW_CLAIMS && (BASE.includes('jriq.in') || KEYS_FILE.includes('prod'))) {
  console.error('Refusing: claim-creating load never runs against production')
  process.exit(2)
}

const { chromium } = await import('playwright')
const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
const keys = { url: parsed.url, anon: parsed.anon }
const anon = createClient(keys.url, keys.anon, { auth: { persistSession: false } })

mkdirSync(OUT, { recursive: true })
const THRESHOLDS = { lcpMs: 2500, cls: 0.1, apiP95Ms: 1000, errorRatePct: 1, navP95Ms: 3000 }
const report = { tag: TAG, base: BASE, startedAt: new Date().toISOString(), thresholds: THRESHOLDS, proposedThresholds: true, phases: {} }

function pct(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}
function stats(values) {
  return {
    n: values.length,
    p50: pct(values, 50),
    p90: pct(values, 90),
    p95: pct(values, 95),
    p99: pct(values, 99),
    max: values.length ? Math.max(...values) : 0,
    min: values.length ? Math.min(...values) : 0,
  }
}
function resources() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-Process node,chrome -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64,CPU -Sum | ForEach-Object { $_.Property + \'=\' + [math]::Round($_.Sum) }"',
      { encoding: 'utf8', timeout: 15000 },
    )
    return out.trim().split(/\r?\n/).filter(Boolean).join(' ')
  } catch {
    return 'unavailable'
  }
}

function syntheticPhone() {
  return `9${String(100000000 + Math.floor(Math.random() * 899999999))}`
}
let nameSeq = 0
function submitJob(slug, amount) {
  nameSeq += 1
  return {
    p_store_slug: slug,
    p_request_id: crypto.randomUUID(),
    p_customer_name: `QA Perf ${Date.now().toString(36)} ${nameSeq}`,
    p_customer_phone: syntheticPhone(),
    p_purchase_amount: amount,
  }
}

async function vitalsPhase(browser) {
  const pages = [
    ...SLUGS.map((s) => ({ key: `/${s}`, path: `/${s}` })),
    { key: '/', path: '/' },
    { key: '/vendor/login', path: '/vendor/login' },
  ]
  const out = []
  for (const p of pages) {
    for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp })
      const page = await ctx.newPage()
      const t0 = Date.now()
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'load', timeout: 45000 }).catch(() => null)
      const navMs = Date.now() - t0
      await page.waitForTimeout(1200)
      const vitals = await page.evaluate(() =>
        new Promise((resolve) => {
          const nav = performance.getEntriesByType('navigation')[0]
          const paints = performance.getEntriesByType('paint')
          let lcp = 0
          let cls = 0
          let longTasks = 0
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) lcp = Math.max(lcp, e.startTime)
            }).observe({ type: 'largest-contentful-paint', buffered: true })
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value
            }).observe({ type: 'layout-shift', buffered: true })
            new PerformanceObserver((list) => {
              longTasks += list.getEntries().length
            }).observe({ type: 'longtask', buffered: true })
          } catch {
            /* observer types unsupported */
          }
          setTimeout(() => {
            resolve({
              ttfb: Math.round(nav?.responseStart ?? 0),
              fcp: Math.round(paints.find((x) => x.name === 'first-contentful-paint')?.startTime ?? 0),
              lcp: Math.round(lcp),
              cls: Number(cls.toFixed(4)),
              longTasks,
              domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
              loadEvent: Math.round(nav?.loadEventEnd ?? 0),
            })
          }, 600)
        }),
      )
      out.push({ page: p.key, viewport: `${vp.width}x${vp.height}`, navMs, ...vitals })
      await ctx.close()
    }
  }
  return out
}

async function browserLoadPhase(browser, concurrency, rounds) {
  const navTimings = []
  const errors = []
  for (let r = 0; r < rounds; r += 1) {
    const jobs = Array.from({ length: concurrency }, (_, i) => SLUGS[i % SLUGS.length])
    const results = await Promise.all(
      jobs.map(async (slug) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
        const page = await ctx.newPage()
        const t0 = Date.now()
        try {
          await page.goto(`${BASE}/${slug}`, { waitUntil: 'load', timeout: 45000 })
          navTimings.push(Date.now() - t0)
          await page.waitForTimeout(300)
        } catch (err) {
          errors.push(String(err?.message ?? err).slice(0, 80))
        } finally {
          await ctx.close()
        }
      }),
    )
    void results
  }
  return { concurrency, rounds, nav: stats(navTimings), errors: errors.length }
}

async function apiRampPhase(concurrency, perWorker) {
  const latencies = []
  let errors = 0
  const activeSlugs = SLUGS.filter((s) => s !== 'pashupati')
  const t0 = Date.now()
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      for (let i = 0; i < perWorker; i += 1) {
        const slug = activeSlugs[(w + i) % activeSlugs.length]
        const s0 = Date.now()
        const res = await anon.rpc('submit_customer_entry', submitJob(slug, i % 2 ? 5000 : 2000))
        latencies.push(Date.now() - s0)
        if (res.error) errors += 1
      }
    }),
  )
  const wallMs = Date.now() - t0
  const total = concurrency * perWorker
  return {
    concurrency,
    total,
    wallMs,
    throughputPerSec: Number(((total / wallMs) * 1000).toFixed(1)),
    errorRatePct: Number(((errors / total) * 100).toFixed(2)),
    latency: stats(latencies),
  }
}

async function readRampPhase(concurrency, perWorker) {
  const latencies = []
  let errors = 0
  const t0 = Date.now()
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      for (let i = 0; i < perWorker; i += 1) {
        const s0 = Date.now()
        const res = await anon.from('stores').select('id, slug').limit(20)
        latencies.push(Date.now() - s0)
        if (res.error) errors += 1
      }
    }),
  )
  const wallMs = Date.now() - t0
  const total = concurrency * perWorker
  return {
    concurrency,
    total,
    wallMs,
    throughputPerSec: Number(((total / wallMs) * 1000).toFixed(1)),
    errorRatePct: Number(((errors / total) * 100).toFixed(2)),
    latency: stats(latencies),
  }
}

async function sustainedPhase(seconds, concurrency) {
  const latencies = []
  let errors = 0
  let done = 0
  const activeSlugs = SLUGS.filter((s) => s !== 'pashupati')
  const deadline = Date.now() + seconds * 1000
  const buckets = []
  let bucketStart = Date.now()
  let bucketCount = 0
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      let i = 0
      while (Date.now() < deadline) {
        const slug = activeSlugs[(w + i) % activeSlugs.length]
        const s0 = Date.now()
        const res = await anon.rpc('submit_customer_entry', submitJob(slug, 2000))
        const ms = Date.now() - s0
        latencies.push(ms)
        done += 1
        bucketCount += 1
        if (res.error) errors += 1
        if (Date.now() - bucketStart >= 10000) {
          buckets.push({ atSec: Math.round((Date.now() - bucketStart) / 1000), requests: bucketCount })
          bucketStart = Date.now()
          bucketCount = 0
        }
        i += 1
      }
    }),
  )
  return {
    seconds,
    concurrency,
    total: done,
    throughputPerSec: Number((done / seconds).toFixed(1)),
    errorRatePct: Number(((errors / Math.max(1, done)) * 100).toFixed(2)),
    latency: stats(latencies),
    firstHalfP95: pct(latencies.slice(0, Math.floor(latencies.length / 2)), 95),
    secondHalfP95: pct(latencies.slice(Math.floor(latencies.length / 2)), 95),
    buckets,
  }
}

async function wheelSmoothnessPhase(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/${SLUGS[0]}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await page.getByLabel('Full name').waitFor({ timeout: 10000 })
  await page.getByLabel('Full name').fill(`QA Wheel ${Date.now().toString(36)}`)
  await page.getByLabel('Purchase amount in Indian Rupees').fill('2000')
  await page.getByLabel('10-digit mobile number').fill(`9${String(100000000 + Math.floor(Math.random() * 899999999))}`)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await page.getByText('SHARE YOUR EXPERIENCE').waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: /Leave a Google Review/i }).click()
  await page.getByRole('dialog', { name: 'Share Your Experience' }).waitFor({ timeout: 5000 })
  // tap a suggestion so the flow detects the review return - the "Spin Now"
  // button renders only in that state (SpinWinScreen.tsx:155); a plain skip
  // spins via the wheel's own control instead
  await page.locator('.review-suggestion').first().click()
  await page.waitForTimeout(500)
  for (const p of page.context().pages()) {
    if (p !== page) await p.close().catch(() => {})
  }
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.getByText('WELCOME BACK!').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Spin Now' }).click()
  await page.evaluate(() => {
    window.__frameDeltas = []
    let last = performance.now()
    const tick = (t) => {
      window.__frameDeltas.push(t - last)
      last = t
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.getByText(/YOU WON|CONGRATULATIONS/i).first().waitFor({ timeout: 40000 })
  const deltas = await page.evaluate(() => window.__frameDeltas ?? [])
  await ctx.close()
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0
  const jank = deltas.filter((d) => d > 34).length
  return {
    frames: deltas.length,
    avgFrameMs: Number(avg.toFixed(2)),
    approxFps: avg ? Number((1000 / avg).toFixed(1)) : 0,
    jankyFramesOver34ms: jank,
    jankPct: deltas.length ? Number(((jank / deltas.length) * 100).toFixed(1)) : 0,
    worstFrameMs: deltas.length ? Math.round(Math.max(...deltas)) : 0,
  }
}

async function main() {
  const browser = await chromium.launch()
  try {
    console.log(`INFO  resources at start: ${resources()}`)

    if (wanted('vitals')) {
    console.log('PHASE vitals (single-user baseline)')
    report.phases.vitals = await vitalsPhase(browser)
    for (const v of report.phases.vitals) {
      const ok = v.lcp <= THRESHOLDS.lcpMs && v.cls <= THRESHOLDS.cls
      console.log(`${ok ? 'PASS' : 'WARN'}  vitals ${v.page} [${v.viewport}] ttfb=${v.ttfb}ms fcp=${v.fcp}ms lcp=${v.lcp}ms cls=${v.cls} longTasks=${v.longTasks} nav=${v.navMs}ms`)
    }
    }

    if (wanted('browserload')) {
    console.log('PHASE browserload (parallel customers)')
    report.phases.browserload = []
    for (const concurrency of [4, 16]) {
      const r = await browserLoadPhase(browser, concurrency, 2)
      report.phases.browserload.push(r)
      const ok = r.nav.p95 <= THRESHOLDS.navP95Ms && r.errors === 0
      console.log(`${ok ? 'PASS' : 'WARN'}  browserload x${concurrency}: nav p50=${r.nav.p50} p95=${r.nav.p95} max=${r.nav.max} errors=${r.errors}`)
    }
    }

    if (ALLOW_CLAIMS && wanted('apiramp')) {
      console.log('PHASE apiramp (submit throughput ramp)')
      report.phases.apiramp = []
      for (const concurrency of [1, 8, 32, 64]) {
        const r = await apiRampPhase(concurrency, concurrency === 1 ? 8 : 4)
        report.phases.apiramp.push(r)
        const ok = r.latency.p95 <= THRESHOLDS.apiP95Ms && r.errorRatePct <= THRESHOLDS.errorRatePct
        console.log(`${ok ? 'PASS' : 'WARN'}  apiramp x${concurrency}: n=${r.total} thr=${r.throughputPerSec}/s p50=${r.latency.p50} p90=${r.latency.p90} p95=${r.latency.p95} p99=${r.latency.p99} max=${r.latency.max} err=${r.errorRatePct}% (${r.wallMs}ms)`)
      }
    }

    if (ALLOW_CLAIMS && wanted('sustained')) {
      report.phases.sustained = await sustainedPhase(SUSTAINED_SECONDS, 8)
      const s = report.phases.sustained
      const degraded = s.secondHalfP95 > s.firstHalfP95 * 1.5 && s.secondHalfP95 > 200
      console.log(`${degraded ? 'WARN' : 'PASS'}  sustained ${s.seconds}s x${s.concurrency}: n=${s.total} thr=${s.throughputPerSec}/s p50=${s.latency.p50} p95=${s.latency.p95} max=${s.latency.max} err=${s.errorRatePct}% firstHalfP95=${s.firstHalfP95} secondHalfP95=${s.secondHalfP95}`)
    }

    if (ALLOW_CLAIMS && wanted('wheel')) {
      console.log('PHASE wheel (animation smoothness during spin)')
      report.phases.wheel = await wheelSmoothnessPhase(browser)
      const w = report.phases.wheel
      console.log(`${w.jankPct <= 10 ? 'PASS' : 'WARN'}  wheel spin: frames=${w.frames} avg=${w.avgFrameMs}ms (~${w.approxFps} fps) jank>34ms=${w.jankyFramesOver34ms} (${w.jankPct}%) worst=${w.worstFrameMs}ms`)
    }

    if (wanted('readramp')) {
    console.log('PHASE readramp (anonymous reads)')
    report.phases.readramp = []
    for (const concurrency of [1, 32, 64]) {
      const r = await readRampPhase(concurrency, concurrency === 1 ? 8 : 4)
      report.phases.readramp.push(r)
      const ok = r.latency.p95 <= THRESHOLDS.apiP95Ms && r.errorRatePct <= THRESHOLDS.errorRatePct
      console.log(`${ok ? 'PASS' : 'WARN'}  readramp x${concurrency}: n=${r.total} thr=${r.throughputPerSec}/s p50=${r.latency.p50} p95=${r.latency.p95} max=${r.latency.max} err=${r.errorRatePct}%`)
    }
    }

    report.resourcesAfter = resources()
    console.log(`INFO  resources at end: ${report.resourcesAfter}`)
    report.finishedAt = new Date().toISOString()
    const file = join(OUT, `perf-${TAG}.json`)
    writeFileSync(file, JSON.stringify(report, null, 2))
    console.log(`RESULT perf-audit written to ${file}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(`FAIL  perf-audit crashed: ${err?.stack ?? err}`)
  process.exit(1)
})
