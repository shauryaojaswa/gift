import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SYSTEM_ROUTE_SLUGS,
  PUBLIC_RESOURCE_SLUGS,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  isReservedSlug,
  isRoutableSlug,
} from './slugs'

// npm test runs from the repo root; happy-dom's import.meta.url is not
// file-scheme, so resolve the migration from cwd.
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20261016090000_reserved_slug_guard.sql',
)

describe('reserved slug wall — router half (slugs.ts)', () => {
  it('pins the exact system-route reserved list', () => {
    expect([...SYSTEM_ROUTE_SLUGS]).toEqual([
      'admin',
      'api',
      'assets',
      'auth',
      'dashboard',
      'login',
      'platform',
      'privacy',
      'standee',
      'store',
      'vendor',
    ])
  })

  it('pins the exact public-resource reserved list', () => {
    expect([...PUBLIC_RESOURCE_SLUGS]).toEqual([
      '.htaccess',
      '404.html',
      'error_pages',
      'favicon.ico',
      'favicon.svg',
      'icons.svg',
      'index.html',
      'logo-placeholder.svg',
      'logo.svg',
      'manifest.json',
      'robots.txt',
      'sitemap.xml',
    ])
  })

  it('RESERVED_SLUGS is exactly system routes + public resources', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual(
      [...SYSTEM_ROUTE_SLUGS, ...PUBLIC_RESOURCE_SLUGS].sort(),
    )
  })
})

describe('reserved slug wall — database half must mirror the router half', () => {
  it('stores_slug_reserved_check lists exactly RESERVED_SLUGS', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    const constraint = sql.match(/check \(slug not in \(([^)]+)\)\)/)
    expect(constraint, 'reserved CHECK block not found in migration').not.toBeNull()
    const dbList = [...constraint![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(dbList.sort()).toEqual([...RESERVED_SLUGS].sort())
  })

  it('the migration refuses to run if any existing row is reserved', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    expect(sql).toMatch(/Reserved-slug guard refused: existing stores use reserved slugs/)
    // Additive-only: the migration must never delete or rewrite data.
    expect(sql.toLowerCase()).not.toMatch(/\bdelete\s+from\b/)
    expect(sql.toLowerCase()).not.toMatch(/\bdrop\s+table\b/)
    expect(sql.toLowerCase()).not.toMatch(/\btruncate\b/)
  })
})

describe('SLUG_PATTERN — same shape the database accepts', () => {
  it.each([
    'jolly-enterprises',
    'kalyan',
    'a',
    'shop-2',
    'x9-y8-z7',
  ])('accepts %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(true)
  })

  it.each([
    '',
    '-shop',
    'shop-',
    'shop--two',
    'Shop',
    'SHOP',
    'sh op',
    'shop_2',
    'shop/2',
    'shop.json',
    '.htaccess',
    'shop.',
    '-',
  ])('rejects %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(false)
  })
})

describe('isRoutableSlug — what the router may treat as a shop address', () => {
  it('accepts ordinary shop slugs', () => {
    expect(isRoutableSlug('jolly-enterprises')).toBe(true)
    expect(isRoutableSlug('kalyan-jewellers')).toBe(true)
  })

  it.each([
    'admin',
    'api',
    'assets',
    'auth',
    'dashboard',
    'login',
    'platform',
    'privacy',
    'standee',
    'store',
    'vendor',
  ])('refuses system route segment %s even though it matches the pattern', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(true) // the DB pattern alone would allow it
    expect(isReservedSlug(slug)).toBe(true)
    expect(isRoutableSlug(slug)).toBe(false)
  })

  it.each([
    '.htaccess',
    '404.html',
    'error_pages',
    'favicon.ico',
    'favicon.svg',
    'icons.svg',
    'index.html',
    'logo-placeholder.svg',
    'logo.svg',
    'manifest.json',
    'robots.txt',
    'sitemap.xml',
  ])('refuses public resource %s', (slug) => {
    expect(isReservedSlug(slug)).toBe(true)
    expect(isRoutableSlug(slug)).toBe(false)
  })

  it('refuses undefined and empty slugs', () => {
    expect(isRoutableSlug(undefined)).toBe(false)
    expect(isRoutableSlug('')).toBe(false)
  })

  it('never treats an admin surface as a shop address', () => {
    // The catch-all is dead last and ShopPage validates before rendering:
    // a crafted URL must land on the designed 404, never another shop.
    for (const crafted of ['admin', 'store', 'platform', 'vendor', 'index.html']) {
      expect(isRoutableSlug(crafted)).toBe(false)
    }
  })
})
