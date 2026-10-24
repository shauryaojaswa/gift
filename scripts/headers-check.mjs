#!/usr/bin/env node
/**
 * Response-header check for the production origin.
 *
 * The origin is shared hosting (Apache/LiteSpeed) and the application's
 * .htaccess is the only place where response headers can be set. This script
 * verifies what the browser actually receives:
 *   - Cache-Control on the entry document (must not be cached stale),
 *   - Cache-Control on a content-hashed asset (should be immutable),
 *   - the standard security headers.
 *
 * Usage: node scripts/headers-check.mjs [--origin https://jriq.in]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const argv = process.argv.slice(2)
const i = argv.indexOf('--origin')
const ORIGIN = (i >= 0 && argv[i + 1] ? argv[i + 1] : 'https://jriq.in').replace(/\/$/, '')

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`PASS  ${name}${detail ? ' - ' + detail : ''}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' - ' + detail : ''}`)
  }
}

// discover a content-hashed asset from the live entry document
const html = await (await fetch(`${ORIGIN}/`, { cache: 'no-store' })).text()
const asset = (html.match(/\/assets\/[A-Za-z0-9_-]+\.(js|css)/) || [])[0]

const head = async (path) => {
  const res = await fetch(ORIGIN + path, { method: 'HEAD', cache: 'no-store' })
  const h = {}
  for (const [k, v] of res.headers) h[k.toLowerCase()] = v
  return { status: res.status, headers: h }
}

const root = await head('/')
check('entry document responds 200', root.status === 200, `status=${root.status}`)
const htmlCache = root.headers['cache-control'] ?? ''
check(
  'entry document is not cached stale (no-cache / must-revalidate)',
  /no-cache|no-store|max-age=0/i.test(htmlCache),
  `cache-control="${htmlCache}"`,
)

if (asset) {
  const a = await head(asset)
  const assetCache = a.headers['cache-control'] ?? ''
  check(
    `hashed asset ${asset} is served with its real type`,
    (a.headers['content-type'] ?? '').includes('javascript') || (a.headers['content-type'] ?? '').includes('css'),
    `content-type=${a.headers['content-type']}`,
  )
  check(
    `hashed asset ${asset} is cached immutably`,
    /immutable|max-age=31536000/i.test(assetCache),
    `cache-control="${assetCache}"`,
  )
} else {
  check('a content-hashed asset was discovered in the entry document', false, 'none found')
}

for (const [header, expected] of [
  ['x-content-type-options', /nosniff/i],
  ['x-frame-options', /SAMEORIGIN|DENY/i],
  ['referrer-policy', /strict-origin|no-referrer/i],
  ['permissions-policy', /./],
  ['strict-transport-security', /max-age=\d+/i],
]) {
  const value = root.headers[header] ?? ''
  check(`security header ${header} is present`, expected.test(value), value ? `"${value}"` : 'missing')
}

console.log(`\nRESULT ${pass} passed, ${fail} failed (${ORIGIN})`)
process.exit(fail === 0 ? 0 : 1)
