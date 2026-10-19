/**
 * Shared logo-file rules for every logo upload surface (shop-owner settings,
 * vendor settings, platform new-shop wizard, operator tooling), so all
 * uploaders accept exactly the same formats and limits and a shop owner can
 * upload or replace their own logo without operator involvement.
 *
 * The persisted logo lives at `store-logos/{storeId}/{uuid}.{ext}` (see
 * src/lib/data/supabase.ts uploadStoreLogo); the storage RLS policy matches
 * the object folder to the shop, so uploads can never cross tenants.
 */

export const LOGO_MAX_BYTES = 5 * 1024 * 1024
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
export const LOGO_HELP_TEXT = 'JPG, PNG or WebP; maximum 5 MB.'
export const LOGO_INVALID_MESSAGE = 'Choose a JPG, PNG or WebP image smaller than 5 MB'

const LOGO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type LogoFileValidation = { ok: true; extension: string } | { ok: false; error: string }

/**
 * Validate a chosen file exactly once for every upload surface: JPEG/PNG/WebP,
 * non-empty, at most 5 MB. Returns the storage extension on success.
 */
export function validateLogoFile(file: { type: string; size: number }): LogoFileValidation {
  const extension = LOGO_EXTENSIONS[file.type]
  if (!extension || file.size <= 0 || file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: LOGO_INVALID_MESSAGE }
  }
  return { ok: true, extension }
}

/** True when a stored logo URL should render as an image (not as the fallback). */
export function isRenderableLogo(logoUrl: string | null | undefined): boolean {
  const cleaned = (logoUrl ?? '').trim()
  if (cleaned === '') return false
  // Compare the bare file name so query strings and cache busters
  // ("logo-placeholder.svg?v=2") still count as the neutral placeholder,
  // while a different file that merely ends with the same words does not.
  const fileName = cleaned.split(/[?#]/)[0]!.split('/').pop() ?? ''
  return fileName !== '' && fileName !== 'logo-placeholder.svg'
}
