#!/usr/bin/env node
/**
 * Pre/post deploy guard for the production origin.
 *
 * A successful upload is NOT a successful deployment: two failure modes have
 * already shipped a broken release to https://jriq.in, and both are silent
 * from the uploader's point of view:
 *
 *   1. Wrong base path. `npm run build` builds for GitHub Pages
 *      (base "/gift/"), `npm run build:root` builds for the domain root.
 *      Deploying the Pages build to jriq.in serves an index.html whose
 *      entry script resolves to /gift/assets/... -> 404 -> the SPA fallback
 *      answers 200 and the site renders blank.
 *   2. Missing production configuration. VITE_SUPABASE_URL /
 *      VITE_SUPABASE_ANON_KEY / VITE_PUBLIC_APP_URL are baked at BUILD time.
 *      A build without them ships the demo (local) data provider: the site
 *      renders, but nothing persists and no Supabase project is contacted.
 *
 * Usage:
 *   node scripts/predeploy-check.mjs --dist dist            # pre-upload gate
 *   node scripts/predeploy-check.mjs --dist dist --live     # post-upload verify
 *
 * Exit code 0 = pass, 1 = fail. Prints PASS/FAIL rows only; never prints
 * key material.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const DIST = arg('--dist', 'dist')
const LIVE = argv.includes('--live')
const ORIGIN = arg('--origin', 'https://jriq.in')

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' - ' + detail : ''}`)
  }
}

const indexPath = join(DIST, 'index.html')
if (!existsSync(indexPath)) {
  console.error(`FAIL  build output missing - ${indexPath} (run the build first)`)
  process.exit(1)
}
const html = readFileSync(indexPath, 'utf8')

// 1. base path --------------------------------------------------------------
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
const assetRefs = refs.filter((r) => r.startsWith('/assets/') || r.startsWith('/gift/assets/'))
check(
  'build base path is the domain root (not /gift/)',
  !html.includes('"/gift/') && assetRefs.every((r) => r.startsWith('/assets/')),
  assetRefs.find((r) => r.startsWith('/gift/')) || 'index.html references a non-root base',
)
check('index.html references at least one hashed entry script', /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(html))

// 2. production configuration baked in -------------------------------------
let all = ''
const assetDir = join(DIST, 'assets')
if (existsSync(assetDir)) {
  for (const f of readdirSync(assetDir)) {
    if (f.endsWith('.js') || f.endsWith('.css')) {
      all += readFileSync(join(assetDir, f), 'utf8')
    }
  }
}
const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || ''
check(
  'production Supabase URL baked into the bundle',
  !supabaseUrl || all.includes(supabaseUrl),
  'build without VITE_SUPABASE_URL ships the demo provider',
)
check(
  'production anon key baked into the bundle',
  !anonKey || all.includes(anonKey),
  'build without VITE_SUPABASE_ANON_KEY ships the demo provider',
)
check('canonical app URL baked into the bundle', !process.env.VITE_PUBLIC_APP_URL || all.includes(process.env.VITE_PUBLIC_APP_URL))
check('bundle contains no "service_role" role claim', !all.includes('"service_role"'))
// Explicit service-key check when the operator has the key locally.
try {
  const keysPath = join(process.env.TEMP || '', 'jriq-keys-prod.json')
  if (existsSync(keysPath)) {
    const keys = JSON.parse(readFileSync(keysPath, 'utf8'))
    check('service-role key is NOT present in any client bundle', !all.includes(keys.service))
  }
} catch {
  /* optional check - skipped when the local key file is unavailable */
}

// 3. every referenced asset exists locally ---------------------------------
const missingLocal = assetRefs.filter((r) => !existsSync(join(DIST, r.replace(/\//g, sep))))
check('every asset referenced by index.html exists in the build output', missingLocal.length === 0, missingLocal.join(', '))

// 4. post-upload verification ----------------------------------------------
if (LIVE) {
  const { createHash } = await import('node:crypto')
  const sha = (buf) => createHash('sha256').update(buf).digest('hex')
  for (const r of [...new Set(assetRefs)]) {
    let status = 0
    let ok = false
    let detail = ''
    try {
      const res = await fetch(ORIGIN + r, { cache: 'no-store' })
      status = res.status
      // The origin may serve gzip/br, so compare the DECOMPRESSED body with the
      // local file (Content-Length reflects the compressed size and would be a
      // false mismatch).
      const body = Buffer.from(await res.arrayBuffer())
      const local = readFileSync(join(DIST, r.replace(/\//g, sep)))
      ok = status === 200 && sha(body) === sha(local)
      detail = `status=${status} localSha=${sha(local).slice(0, 12)} remoteSha=${sha(body).slice(0, 12)}`
    } catch (e) {
      detail = e.message
    }
    check(`live asset ${r} is served (200, byte-identical)`, ok, detail)
  }
  const liveHtml = await (await fetch(`${ORIGIN}/`, { cache: 'no-store' })).text()
  check('live index.html references the same entry script as the build', liveHtml.includes(html.match(/index-[A-Za-z0-9_-]+\.js/)[0]))
  check('live index.html does not reference the /gift/ base', !liveHtml.includes('"/gift/'))
}

console.log(`\nRESULT ${pass} passed, ${fail} failed (${LIVE ? 'post-upload' : 'pre-upload'} guard, dist=${relative(process.cwd(), DIST) || DIST})`)
process.exit(fail === 0 ? 0 : 1)
