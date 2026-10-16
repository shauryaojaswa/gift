// Cutover watch (Phase C) — read-only HTTPS/TLS probes during the post-cutover
// watch window. Checks every round (v1.1.x artifact contract):
//   1. GET <base>/                        -> 200 (site serves the app)
//   2. GET <base>/jolly-enterprises       -> 200 (root-level deep link / SPA fallback)
//   3. GET <base>/store/jolly-enterprises -> 301 + exact Location /jolly-enterprises
//      (the strict legacy-301 row; redirect inspected as served, never auto-followed)
//   4. TLS certificate of <base> host     -> >= min-cert-days days remaining
//   5. GET https://shauryaojaswa.github.io/gift/ -> 200 (Pages rollback alive)
// Writes timestamped PASS/FAIL lines to logs/cutover-watch-<stamp>.log (the
// logs/ directory is gitignored). Submitting data is impossible by design:
// only GET requests are issued, never a body.
//
// Usage:
//   node scripts/cutover-watch.mjs
//       --base https://jriq.in          (default)
//       --minutes 60                    (total window)
//       --interval 120                  (seconds between rounds)
//       --min-cert-days 14
//       --deep-ok 200                   (comma list of accepted deep-link statuses;
//                                        use 200,404 when proving against Pages,
//                                        where deep links return a document 404 by design)
//       --pages https://shauryaojaswa.github.io/gift/
//       --once                          (single round, then exit)
//       --log <path>                    (override log file)
// Exit code 0 = every round passed; 1 = at least one FAIL line.
import tls from 'node:tls'
import { mkdirSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---- CLI ----
const args = process.argv.slice(2)
function arg(name, dflt) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt
}
const base = arg('base', 'https://jriq.in').replace(/\/+$/, '')
const minutes = Number(arg('minutes', '60'))
const intervalSec = Number(arg('interval', '120'))
const minCertDays = Number(arg('min-cert-days', '14'))
const deepOk = arg('deep-ok', '200').split(',').map((s) => Number(s.trim()))
const pages = arg('pages', 'https://shauryaojaswa.github.io/gift/').replace(/\/+$/, '')
const once = args.includes('--once')
const logPath = arg('log', path.join(repoRoot, 'logs', `cutover-watch-${new Date().toISOString().replace(/[:.]/g, '-')}.log`))

mkdirSync(path.dirname(logPath), { recursive: true })
let pass = 0
let fail = 0
function line(status, name, detail = '') {
  const ts = new Date().toISOString()
  const text = `${ts} ${status} ${name}${detail ? ` ${detail}` : ''}`
  console.log(text)
  appendFileSync(logPath, text + '\n', 'utf8')
  if (status === 'PASS') pass += 1
  else if (status === 'FAIL') fail += 1
}

async function httpStatus(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    await res.body?.cancel()
    return { status: res.status }
  } catch (err) {
    return { error: String(err?.message ?? err).slice(0, 160) }
  }
}

async function httpRaw(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    await res.body?.cancel()
    return { status: res.status, location: res.headers.get('location') }
  } catch (err) {
    return { error: String(err?.message ?? err).slice(0, 160) }
  }
}

function certDays(host) {
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    const socket = tls.connect({ host, port: 443, servername: host }, () => {
      const cert = socket.getPeerCertificate()
      const authorized = socket.authorized
      socket.end()
      const to = Date.parse(cert?.valid_to ?? '')
      if (Number.isNaN(to)) return done({ error: `no peer certificate for ${host}` })
      done({ days: Math.floor((to - Date.now()) / 86400000), validTo: cert.valid_to, authorized })
    })
    socket.on('error', (err) => done({ error: String(err?.message ?? err).slice(0, 160) }))
    setTimeout(() => { socket.destroy(); done({ error: 'tls handshake timeout' }) }, 15000)
  })
}

async function round(n, totalRounds) {
  line('INFO', `round ${n}/${totalRounds}`, `base=${base}`)

  const root = await httpStatus(`${base}/`)
  if (root.status === 200) line('PASS', 'https root', `${base}/ -> 200`)
  else line('FAIL', 'https root', `${base}/ -> ${root.status ?? root.error}`)

  const deep = await httpStatus(`${base}/jolly-enterprises`)
  if (deepOk.includes(deep.status)) line('PASS', 'deep link', `${base}/jolly-enterprises -> ${deep.status} (accepted: ${deepOk.join(',')})`)
  else line('FAIL', 'deep link', `${base}/jolly-enterprises -> ${deep.status ?? deep.error} (accepted: ${deepOk.join(',')})`)

  // The strict legacy-301 row: the v1.1.x .htaccess answers a real HTTP 301 for
  // legacy /store/{slug} before the SPA loads. Same acceptance as
  // deploy-verify.ps1: Location must be exactly the target path, relative or
  // absolute form.
  const legacy = await httpRaw(`${base}/store/jolly-enterprises`)
  const wantLoc = ['/jolly-enterprises', `${base}/jolly-enterprises`]
  if (legacy.status === 301 && wantLoc.includes(legacy.location)) {
    line('PASS', 'legacy 301', `/store/jolly-enterprises -> 301 Location=${legacy.location}`)
  } else {
    line('FAIL', 'legacy 301', `/store/jolly-enterprises -> ${legacy.status ?? legacy.error} Location=${legacy.location ?? '(none)'} (want 301 + /jolly-enterprises)`)
  }

  const host = new URL(base).hostname
  const cert = await certDays(host)
  if (cert.error) line('FAIL', 'tls certificate', `${host}: ${cert.error}`)
  else if (cert.days >= minCertDays) line('PASS', 'tls certificate', `${host} valid_to=${cert.validTo} days_left=${cert.days} authorized=${cert.authorized}`)
  else line('FAIL', 'tls certificate', `${host} valid_to=${cert.validTo} days_left=${cert.days} (< ${minCertDays})`)

  const pg = await httpStatus(`${pages}/`)
  if (pg.status === 200) line('PASS', 'pages rollback target', `${pages}/ -> 200`)
  else line('FAIL', 'pages rollback target', `${pages}/ -> ${pg.status ?? pg.error}`)
}

const totalRounds = once ? 1 : Math.max(1, Math.ceil((minutes * 60) / intervalSec))
const started = Date.now()
for (let n = 1; n <= totalRounds; n += 1) {
  await round(n, totalRounds)
  if (n < totalRounds) {
    const elapsed = (Date.now() - started) / 1000
    const waitMs = Math.max(0, Math.min(intervalSec, minutes * 60 - elapsed)) * 1000
    if (waitMs <= 0) break
    await new Promise((r) => setTimeout(r, waitMs))
  }
}
line('INFO', 'log file', logPath)
console.log(`RESULT ${pass} passed, ${fail} failed (cutover watch)`)
process.exit(fail === 0 ? 0 : 1)
