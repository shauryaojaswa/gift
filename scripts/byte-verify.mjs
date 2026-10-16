// Post-deploy byte verification: every deployable file in dist/ must be served
// by https://jriq.in/ with EXACTLY the local bytes (SHA-256 compare).
// .htaccess is not servable by design — its effects are verified by the strict
// 301 / SPA-fallback rows in prod-smoke.mjs and live-matrix.mjs instead.
//
// Usage: node scripts/byte-verify.mjs [distDir] [origin]
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const distDir = process.argv[2] ?? 'dist'
const origin = (process.argv[3] ?? 'https://jriq.in').replace(/\/$/, '')
const SKIP = new Set(['.htaccess'])

function collect(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collect(full))
    else out.push(full)
  }
  return out
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const lines = []
let pass = 0
let fail = 0

for (const file of collect(distDir)) {
  const rel = relative(distDir, file).split(sep).join('/')
  if (SKIP.has(rel)) continue
  const local = readFileSync(file)
  const localHash = sha256(local)
  try {
    const res = await fetch(`${origin}/${rel}`, { redirect: 'manual' })
    const body = Buffer.from(await res.arrayBuffer())
    const remoteHash = sha256(body)
    const ok = res.status === 200 && remoteHash === localHash
    if (ok) pass += 1
    else fail += 1
    lines.push(
      `${ok ? 'PASS' : 'FAIL'}  ${rel}  status=${res.status} local=${localHash.slice(0, 12)} remote=${remoteHash.slice(0, 12)}`,
    )
  } catch (err) {
    fail += 1
    lines.push(`FAIL  ${rel}  fetch error: ${err.message}`)
  }
}

lines.push(`RESULT ${pass} byte-identical, ${fail} failed (${origin})`)
writeFileSync('logs/byte-verify.log', lines.join('\n'), 'ascii')
console.log(lines.join('\n'))
process.exit(fail === 0 ? 0 : 1)
