import { describe, it, expect } from 'vitest'
import { LOGO_MAX_BYTES, isRenderableLogo, validateLogoFile } from './logo-upload'

/** Minimal File stand-in: validateLogoFile only reads type + size. */
function fakeFile(type: string, size: number): { type: string; size: number } {
  return { type, size }
}

describe('validateLogoFile', () => {
  it('accepts JPG, PNG and WebP under the size cap', () => {
    expect(validateLogoFile(fakeFile('image/jpeg', 1024))).toEqual({ ok: true, extension: 'jpg' })
    expect(validateLogoFile(fakeFile('image/png', LOGO_MAX_BYTES))).toEqual({ ok: true, extension: 'png' })
    expect(validateLogoFile(fakeFile('image/webp', 1))).toEqual({ ok: true, extension: 'webp' })
  })

  it('rejects non-image and unlisted image types', () => {
    expect(validateLogoFile(fakeFile('application/pdf', 1024)).ok).toBe(false)
    expect(validateLogoFile(fakeFile('image/gif', 1024)).ok).toBe(false)
    expect(validateLogoFile(fakeFile('image/svg+xml', 1024)).ok).toBe(false)
    expect(validateLogoFile(fakeFile('', 1024)).ok).toBe(false)
  })

  it('rejects empty files', () => {
    expect(validateLogoFile(fakeFile('image/png', 0)).ok).toBe(false)
  })

  it('rejects files above 5 MB', () => {
    expect(validateLogoFile(fakeFile('image/png', LOGO_MAX_BYTES + 1)).ok).toBe(false)
  })

  it('returns a helpful error message, not just a flag', () => {
    const result = validateLogoFile(fakeFile('image/gif', 1024))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/JPG, PNG or WebP/)
      expect(result.error).toMatch(/5 MB/)
    }
  })
})

describe('isRenderableLogo', () => {
  it('treats missing values as no logo', () => {
    expect(isRenderableLogo(null)).toBe(false)
    expect(isRenderableLogo(undefined)).toBe(false)
    expect(isRenderableLogo('')).toBe(false)
    expect(isRenderableLogo('   ')).toBe(false)
  })

  it('treats the neutral placeholder asset as no logo', () => {
    expect(isRenderableLogo('logo-placeholder.svg')).toBe(false)
    expect(isRenderableLogo('/logo-placeholder.svg')).toBe(false)
    expect(isRenderableLogo('/assets/logo-placeholder.svg')).toBe(false)
    expect(isRenderableLogo('/assets/logo-placeholder.svg?v=2')).toBe(false)
    expect(isRenderableLogo('/assets/logo-placeholder.svg#x')).toBe(false)
  })

  it('accepts real logo references', () => {
    expect(isRenderableLogo('https://example.supabase.co/storage/v1/object/public/store-logos/abc/logo.png')).toBe(true)
    expect(isRenderableLogo('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isRenderableLogo('  /assets/shop-logo.png  ')).toBe(true)
  })

  it('does not confuse similarly named files with the placeholder', () => {
    expect(isRenderableLogo('/assets/logo-placeholder.svgx')).toBe(true)
    expect(isRenderableLogo('/assets/my-logo-placeholder.svg')).toBe(true)
  })
})
