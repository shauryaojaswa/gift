/**
 * Reserved URL slugs — the router-level half of the reserved-slug wall.
 *
 * Root-level shop slugs (`/{slug}`) must never shadow a system route or a real
 * file served from `public/`. The other half of the wall is the database CHECK
 * constraint `stores_slug_reserved_check` (migration
 * `20261016090000_reserved_slug_guard.sql`), which refuses to CREATE such a
 * shop. Keep both lists in sync — `slugs.test.ts` pins this file's contents.
 */

/** System paths defined in the router (App.tsx) — one segment each. */
export const SYSTEM_ROUTE_SLUGS = [
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
] as const

/**
 * Real files and directories served from `public/` (plus conventional
 * single-segment system files that must stay reachable even if absent today).
 */
export const PUBLIC_RESOURCE_SLUGS = [
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
] as const

export const RESERVED_SLUGS: ReadonlySet<string> = new Set<string>([
  ...SYSTEM_ROUTE_SLUGS,
  ...PUBLIC_RESOURCE_SLUGS,
])

/** Same shape the database accepts for `stores.slug` (create_shop + CHECK). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
}

/** A slug the router may treat as a shop address. */
export function isRoutableSlug(slug: string | undefined): slug is string {
  return !!slug && SLUG_PATTERN.test(slug) && !isReservedSlug(slug)
}
