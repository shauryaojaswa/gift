// Release preflight for JRIQ. One repeatable command per deployment target:
//
//   node scripts/preflight.mjs pages   # GitHub Pages target (base /gift/)
//   node scripts/preflight.mjs root    # jriq.in domain-root target (base /)
//
// Runs: dependency check, lint, full unit tests, TypeScript, production build,
// environment-selection review, secret scan, and base-path / output verification.
// It never prints secret VALUES — only presence, classification and file names.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const target = process.argv[2] ?? 'pages'
if (target !== 'pages' && target !== 'root') {
  console.error(`Unknown target "${target}" — use "pages" or "root".`)
  process.exit(2)
}
const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let pass = 0
let fail = 0
let warn = 0
function ok(name, detail = '') {
  pass += 1
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function bad(name, detail = '') {
  fail += 1
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}
function caution(name, detail = '') {
  warn += 1
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ''}`)
}

function run(label, args) {
  try {
    // On Windows npm is a .cmd shim and must run through the shell; args are
    // simple fixed tokens (no interpolation), so this is safe.
    execFileSync(npm, args, { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' })
    ok(label)
    return true
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`
    bad(label, `exit ${err.status ?? 1}`)
    console.log(out.split(/\r?\n/).slice(-15).join('\n'))
    return false
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

// --- 1. dependencies -------------------------------------------------------
if (existsSync(join(root, 'node_modules'))) {
  ok('dependencies installed')
} else {
  bad('dependencies installed', 'run: npm install')
}

// --- 2. environment selection (presence/classification only) ---------------
const PRODUCTION_REF = 'awshkiwqkuubkhecszzk'
const STAGING_REF = 'wpytaorgiqkfnifsuhax'
const supaUrl = process.env.VITE_SUPABASE_URL ?? ''
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''
if (!supaUrl) {
  caution(
    'environment selection',
    'VITE_SUPABASE_URL unset — the build runs in LocalDataProvider demo mode (fine for UI smoke, not a live release)',
  )
} else if (supaUrl.includes(STAGING_REF)) {
  bad('environment selection', `VITE_SUPABASE_URL points at the STAGING project — a ${target} release build must use the production project`)
} else if (supaUrl.includes(PRODUCTION_REF)) {
  ok('environment selection', `VITE_SUPABASE_URL targets the production project (${target} release)`)
} else {
  caution('environment selection', 'VITE_SUPABASE_URL points at an unrecognised project')
}
if (anonKey) ok('anon key present', `set (length ${anonKey.length}, role checked below)`)
else caution('anon key present', 'VITE_SUPABASE_ANON_KEY unset — demo mode')

// --- 3. quality gates ------------------------------------------------------
run('lint (oxlint)', ['run', 'lint'])
run('unit tests (vitest)', ['test'])
run('typescript + production build', ['run', target === 'root' ? 'build:root' : 'build'])

// --- 4. secret scan (source strict; build output classified by key role) ----
const JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g
const PRIVATE_KEY = /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/
function roleOf(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : 'unknown'
  } catch {
    return 'unreadable'
  }
}

const sourceDirs = ['src', 'scripts', 'supabase', 'docs', 'public'].filter((d) =>
  existsSync(join(root, d)),
)
let sourceSecrets = 0
for (const dir of sourceDirs) {
  for (const file of walk(join(root, dir))) {
    if (!/\.(ts|tsx|mjs|js|json|md|sql|html|txt)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    if (PRIVATE_KEY.test(text)) {
      bad('source secret scan', `private key block in ${file.slice(root.length + 1)}`)
      sourceSecrets += 1
    }
    const jwts = text.match(JWT) ?? []
    // A short single-segment "eyJ" string is not a JWT; the regex needs 3 parts.
    if (jwts.length > 0) {
      bad('source secret scan', `${jwts.length} JWT literal(s) in ${file.slice(root.length + 1)}`)
      sourceSecrets += 1
    }
  }
}
if (sourceSecrets === 0) ok('source secret scan', 'no key material in source, docs or migrations')

if (existsSync(dist)) {
  const roleCounts = {}
  for (const file of walk(dist)) {
    if (!/\.(js|html|css)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    if (PRIVATE_KEY.test(text)) bad('dist secret scan', `private key block in ${file.slice(root.length + 1)}`)
    for (const jwt of text.match(JWT) ?? []) {
      const role = roleOf(jwt)
      roleCounts[role] = (roleCounts[role] ?? 0) + 1
      if (role === 'service_role') {
        bad('dist secret scan', `service-role key inlined in ${file.slice(root.length + 1)} — never ship the service key in frontend output`)
      }
    }
  }
  const roles = Object.entries(roleCounts).map(([r, n]) => `${r}:${n}`).join(', ')
  if (roles) ok('dist key classification', `inlined keys by role — ${roles}`)
  else ok('dist key classification', 'no inlined keys')
}

// --- 5. base path + expected output ---------------------------------------
const indexHtml = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : null
if (indexHtml === null) {
  bad('dist output', 'dist/index.html missing')
} else {
  ok('dist output', 'dist/index.html present')
  const wantsPagesBase = target === 'pages'
  const hasPagesBase = indexHtml.includes('/gift/assets/')
  const hasRootBase = indexHtml.includes('src="/assets/') || indexHtml.includes('href="/assets/')
  if (wantsPagesBase && hasPagesBase) ok('base path', 'asset URLs use /gift/ (GitHub Pages)')
  else if (!wantsPagesBase && hasRootBase) ok('base path', 'asset URLs use / (domain root)')
  else bad('base path', `expected ${wantsPagesBase ? '/gift/' : '/'} asset URLs in dist/index.html`)

  if (wantsPagesBase) {
    if (indexHtml.includes('history.replaceState')) ok('SPA deep-link restore', 'index restore script present')
    else bad('SPA deep-link restore', 'index.html is missing the ?p= restore script')
    if (existsSync(join(dist, '404.html'))) ok('SPA deep-link restore', 'dist/404.html present')
    else bad('SPA deep-link restore', 'dist/404.html missing (public/404.html not copied)')
  } else {
    if (existsSync(join(dist, '.htaccess'))) ok('SPA fallback', 'dist/.htaccess present (server rewrite)')
    else bad('SPA fallback', 'dist/.htaccess missing (public/.htaccess not copied)')
  }
}

// --- summary ---------------------------------------------------------------
console.log(`\nRESULT ${pass} passed, ${fail} failed, ${warn} warnings (target: ${target})`)
process.exit(fail > 0 ? 1 : 0)
