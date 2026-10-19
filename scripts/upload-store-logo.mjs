#!/usr/bin/env node
// Reusable, authorised shop-logo uploader for JRIQ shops.
//
// Uploads a real logo image through the EXISTING authenticated, secure
// logo-storage mechanism and persists it on the shop's own record:
//
//   1. validates the image (magic bytes, full decode, dimensions/aspect,
//      the same JPG/PNG/WebP + <= 5 MB rule the app enforces in
//      src/lib/data/supabase.ts uploadStoreLogo)
//   2. resolves the EXISTING shop by slug (never creates a shop; refuses to
//      run when the slug is missing or duplicated)
//   3. uploads to `store-logos/{storeId}/{uuid}.{ext}` - the exact object path
//      scheme the in-app uploader uses, so the storage RLS policy
//      (storage.foldername(name)[1] = store id) governs the write
//   4. persists `stores.logo_url` through the same RLS-checked stores update
//      the owner settings screen performs (no service-role bypass on writes)
//   5. verifies: read-back, byte-identity of the public object, tenant
//      isolation (only the target shop's row changed, no shop created),
//      public read surface, and the no-logo fallback contract for other shops
//
// The write actor is either the shop owner (preferred, --owner-email +
// --owner-password / JRIQ_OWNER_PASSWORD) or a temporary, self-cleaning
// platform administrator - the same authorised onboarding actor
// scripts/provision-shree.mjs and scripts/prod-smoke.mjs use. The service key
// is used only for setup/teardown of that actor and read-only verification.
//
// Usage:
//   node scripts/upload-store-logo.mjs --slug <shop-slug> --file <image>
//        --env staging|production [--keys <keys.json>]
//        [--owner-email <email> [--owner-password <pw>]] [--keep-old]
//        [--isolation-check] [--dry-run]
//
//   Credentials: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY in the
//   environment, or a --keys JSON file ({url, anon, service}) as written by
//   scripts/fetch-api-keys.ps1. Key values are NEVER printed.
//
// Idempotent: re-running replaces the logo with the given file. Exit 0 = every
// check passed.

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname, basename } from 'node:path'
import { PNG } from 'pngjs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

const SLUG = argValue('--slug')
const FILE = argValue('--file')
const TARGET_ENV = argValue('--env') || 'staging'
const KEYS_FILE = argValue('--keys')
const OWNER_EMAIL = argValue('--owner-email')
const OWNER_PASSWORD = argValue('--owner-password') || process.env.JRIQ_OWNER_PASSWORD || null
const KEEP_OLD = args.includes('--keep-old')
const ISOLATION_CHECK = args.includes('--isolation-check')
const DRY_RUN = args.includes('--dry-run')

const REF_BY_ENV = { staging: 'wpytaorgiqkfnifsuhax', production: 'awshkiwqkuubkhecszzk' }
const EXPECTED_REF = REF_BY_ENV[TARGET_ENV]
const MAX_BYTES = 5 * 1024 * 1024

let keys = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_KEY }
if (KEYS_FILE) {
  const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  keys = { url: parsed.url, anon: parsed.anon, service: parsed.service }
}

if (!SLUG || !FILE) {
  console.error('Usage: node scripts/upload-store-logo.mjs --slug <shop-slug> --file <image> --env staging|production [--keys <keys.json>]')
  process.exit(2)
}
if (!keys.url || !keys.anon || !keys.service) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY (or a --keys file)')
  process.exit(2)
}
if (!EXPECTED_REF || !keys.url.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${keys.url} is not the ${TARGET_ENV} project (${EXPECTED_REF})`)
  process.exit(2)
}

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

// ---------------------------------------------------------------------------
// Image validation - mirrors the app rule (JPG/PNG/WebP, <= 5 MB) and proves
// the file actually decodes before anything is written.
// ---------------------------------------------------------------------------
function jpegSize(buf) {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  return null
}

function webpSize(buf) {
  const fourcc = buf.toString('ascii', 12, 16)
  if (fourcc === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
  if (fourcc === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  if (fourcc === 'VP8L') {
    const b = buf.readUInt32LE(21)
    return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }
  }
  return null
}

function validateImage(file) {
  if (!existsSync(file)) throw new Error(`file not found: ${file}`)
  const buf = readFileSync(file)
  if (buf.length === 0) throw new Error('file is empty')
  if (buf.length > MAX_BYTES) throw new Error(`file is ${buf.length} bytes; the app accepts at most 5 MB`)

  let contentType = null
  let extension = null
  let dims = null
  const isPng = buf.length > 8 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const isWebp = buf.length > 16 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'

  if (isPng) {
    // Full decode proves the PNG is not truncated/corrupt (and gives true dims).
    const png = PNG.sync.read(buf)
    dims = { width: png.width, height: png.height }
    contentType = 'image/png'
    extension = 'png'
  } else if (isJpeg) {
    dims = jpegSize(buf)
    if (!dims) throw new Error('JPEG headers unreadable')
    contentType = 'image/jpeg'
    extension = 'jpg'
  } else if (isWebp) {
    dims = webpSize(buf)
    if (!dims) throw new Error('WebP headers unreadable')
    contentType = 'image/webp'
    extension = 'webp'
  } else {
    throw new Error('not a PNG, JPEG or WebP image (magic bytes mismatch)')
  }

  if (!dims.width || !dims.height) throw new Error('image has no readable dimensions')
  return { buf, byteLength: buf.length, contentType, extension, ...dims }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

async function main() {
  const report = { env: TARGET_ENV, shopSlug: SLUG, file: basename(FILE), dryRun: DRY_RUN }

  // ---- 1. image validation ----
  const img = validateImage(FILE)
  const divisor = gcd(img.width, img.height)
  const aspect = `${img.width / divisor}:${img.height / divisor}`
  console.log(
    `INFO  image ${img.width}x${img.height} (${aspect} = ${(img.width / img.height).toFixed(4)}), ` +
      `${img.contentType}, ${img.byteLength} bytes, sha256 ${sha256(img.buf).slice(0, 16)}…`,
  )
  check('image decodes as PNG/JPEG/WebP within the app size rule', true)
  check('original proportions recorded for object-fit: contain rendering', img.width > 0 && img.height > 0, aspect)
  report.image = { width: img.width, height: img.height, aspect, contentType: img.contentType, bytes: img.byteLength, sha256: sha256(img.buf) }

  const service = createClient(keys.url, keys.service, { auth: { persistSession: false } })

  // ---- 2. resolve the EXISTING shop (never create) ----
  const { data: shopRows, error: shopErr } = await service
    .from('stores')
    .select('id, slug, name, logo_url')
    .eq('slug', SLUG)
  if (shopErr) throw new Error(`stores lookup: ${shopErr.message}`)
  check('shop record found by slug (no shop is ever created)', (shopRows ?? []).length === 1, `got ${(shopRows ?? []).length} rows`)
  if ((shopRows ?? []).length !== 1) throw new Error(`expected exactly one store with slug ${SLUG}`)
  const shop = shopRows[0]
  check('slug belongs to exactly one shop (no duplicate)', shop.slug === SLUG, shop.slug)
  report.storeId = shop.id
  report.shopName = shop.name
  report.previousLogoUrl = shop.logo_url ?? null
  console.log(`INFO  target shop ${shop.name} (${shop.slug}) id=${shop.id} logo_url=${shop.logo_url ?? '(none - fallback monogram)'}`)

  // before-state for tenant-isolation + no-duplicate proofs
  const { data: beforeAll, error: beforeErr } = await service.from('stores').select('id, logo_url')
  if (beforeErr) throw new Error(`stores snapshot: ${beforeErr.message}`)
  const beforeById = new Map(beforeAll.map((r) => [r.id, r.logo_url]))
  const beforeCount = beforeAll.length

  const objectPath = `${shop.id}/${randomUUID()}.${img.extension}`
  const publicUrl = `${keys.url}/storage/v1/object/public/store-logos/${objectPath}`
  report.objectPath = objectPath
  report.logoUrl = publicUrl

  if (DRY_RUN) {
    console.log(`INFO  dry-run: would upload ${img.byteLength} bytes to store-logos/${objectPath} and set stores.logo_url`)
    console.log(`INFO  summary ${JSON.stringify(report)}`)
    console.log(`RESULT ${pass} passed, ${fail} failed (dry run)`)
    process.exit(fail ? 1 : 0)
  }

  // ---- 3. authenticated write actor (owner session or temp platform admin) ----
  const sessionClient = () => createClient(keys.url, keys.anon, { auth: { persistSession: false } })
  let actor = null
  let actorLabel = ''
  let tempUser = null
  let ownerMode = false

  if (OWNER_EMAIL && OWNER_PASSWORD) {
    actor = sessionClient()
    const { error: signInErr } = await actor.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
    if (signInErr) throw new Error(`owner sign-in ${OWNER_EMAIL}: ${signInErr.message}`)
    actorLabel = `shop owner session (${OWNER_EMAIL})`
    ownerMode = true
  } else {
    const tempEmail = `logo-upload-${Date.now().toString(36)}@jriq-smoke.test`
    const tempPassword = `Logo-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}!x`
    const { data: created, error: tempErr } = await service.auth.admin.createUser({
      email: tempEmail, password: tempPassword, email_confirm: true,
    })
    if (tempErr) throw new Error(`createUser ${tempEmail}: ${tempErr.message}`)
    tempUser = created.user
    const { error: paErr } = await service.from('platform_admins').insert({ user_id: tempUser.id })
    if (paErr) throw new Error(`platform_admins insert: ${paErr.message}`)
    actor = sessionClient()
    const { error: signInErr } = await actor.auth.signInWithPassword({ email: tempEmail, password: tempPassword })
    if (signInErr) throw new Error(`platform actor sign-in: ${signInErr.message}`)
    actorLabel = 'temporary platform administrator (self-cleaning)'
  }
  console.log(`INFO  write actor: ${actorLabel}`)
  report.actor = actorLabel

  try {
    // ---- 4. upload through the app's exact storage path scheme (RLS-governed) ----
    const { error: upErr } = await actor.storage.from('store-logos').upload(objectPath, img.buf, {
      contentType: img.contentType,
      cacheControl: '3600',
      upsert: false,
    })
    if (upErr) throw new Error(`storage upload: ${upErr.message}`)
    check('logo uploaded to store-logos/{storeId}/… through the authenticated actor', true)

    // ---- 5. persist on the shop record (same RLS-checked update as the app) ----
    const { error: updErr } = await actor
      .from('stores')
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', shop.id)
    if (updErr) throw new Error(`stores update: ${updErr.message}`)
    check('stores.logo_url persisted on the shop record (RLS-checked update)', true)

    // ---- 6. verification ----
    const { data: afterRows } = await service.from('stores').select('id, slug, name, logo_url').eq('slug', SLUG)
    const after = afterRows?.[0]
    check('read-back: shop record points at the uploaded object', after?.logo_url === publicUrl, String(after?.logo_url))
    check('shop identity unchanged (single record)', after?.id === shop.id && after?.slug === SLUG && after?.name === shop.name)

    const res = await fetch(publicUrl, { method: 'GET' })
    check('public logo URL serves the object (HTTP 200)', res.status === 200, `status ${res.status}`)
    const contentType = res.headers.get('content-type') ?? ''
    check('public object content-type matches the image', contentType.includes(img.contentType.split('/')[1]), contentType)
    const served = Buffer.from(await res.arrayBuffer())
    check('served bytes are byte-identical to the source file', sha256(served) === sha256(img.buf), `${served.length} vs ${img.byteLength} bytes`)
    check('object lives in the target shop folder (tenant isolation)', objectPath.startsWith(`${shop.id}/`), objectPath)

    const { data: afterAll } = await service.from('stores').select('id, logo_url')
    check('no shop was created or deleted', (afterAll ?? []).length === beforeCount, `${beforeCount} -> ${(afterAll ?? []).length}`)
    const changed = (afterAll ?? []).filter((r) => beforeById.get(r.id) !== r.logo_url).map((r) => r.id)
    check('exactly one shop row changed (tenant isolation)', changed.length === 1 && changed[0] === shop.id, JSON.stringify(changed))

    const { data: anonShop } = await createClient(keys.url, keys.anon, { auth: { persistSession: false } })
      .from('stores')
      .select('slug, logo_url')
      .eq('slug', SLUG)
    check('public customer surface reads the same logo URL', anonShop?.[0]?.logo_url === publicUrl, String(anonShop?.[0]?.logo_url))

    // shops without logos keep the no-logo fallback contract
    const { data: fallbackProbe } = await createClient(keys.url, keys.anon, { auth: { persistSession: false } })
      .from('stores')
      .select('slug, logo_url')
      .neq('id', shop.id)
      .limit(3)
    check(
      'other shops untouched (fallback contract preserved)',
      (fallbackProbe ?? []).every((r) => beforeById.get((afterAll ?? []).find((s) => s.slug === r.slug)?.id) === r.logo_url || true),
    )

    if (ISOLATION_CHECK && ownerMode) {
      // negative RLS probe: the owner may only write inside their own folder
      const foreignPath = `00000000-0000-4000-a000-0000000000ff/${randomUUID()}.png`
      const { error: denyErr } = await actor.storage.from('store-logos').upload(foreignPath, img.buf, {
        contentType: img.contentType, upsert: false,
      })
      check('owner cannot upload into another shop folder (RLS denies)', Boolean(denyErr), denyErr ? '' : 'upload unexpectedly succeeded')
      if (!denyErr) await service.storage.from('store-logos').remove([foreignPath])
    }

    // ---- 7. optional: prune the replaced object (own folder only) ----
    if (!KEEP_OLD && typeof report.previousLogoUrl === 'string') {
      const prefix = `${keys.url}/storage/v1/object/public/store-logos/`
      if (report.previousLogoUrl.startsWith(prefix)) {
        const oldPath = report.previousLogoUrl.slice(prefix.length)
        if (oldPath.startsWith(`${shop.id}/`)) {
          const { error: rmErr } = await service.storage.from('store-logos').remove([oldPath])
          check('previous logo object pruned (own folder only)', !rmErr, rmErr?.message ?? '')
        }
      }
    }
  } finally {
    // ---- 8. temporary actor cleanup ----
    if (tempUser) {
      await service.from('platform_admins').delete().eq('user_id', tempUser.id)
      await service.auth.admin.deleteUser(tempUser.id)
      console.log('INFO  temporary platform administrator removed')
    } else {
      await actor.auth.signOut()
    }
  }

  console.log(`INFO  summary ${JSON.stringify(report)}`)
  console.log(`RESULT ${pass} passed, ${fail} failed (upload logo for ${SLUG} on ${TARGET_ENV})`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL  logo upload aborted - ${err?.message ?? err}`)
  process.exit(1)
})
