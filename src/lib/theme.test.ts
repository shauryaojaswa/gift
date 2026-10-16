import { describe, expect, it } from 'vitest'
import {
  buildShopTheme,
  buildWheelPalette,
  contrastRatio,
  deepenToLuminance,
  hslToString,
  hslToRgb,
  luminance,
  MAX_PRIMARY_LUMINANCE,
  parseColor,
  readableTextOn,
  rgbToHsl,
  sanitizeColor,
  toHex,
} from './theme'

const rgb = (hex: string) => parseColor(hex)!

describe('parseColor', () => {
  it('parses hex, short hex, rgb() and hsl() in both syntaxes', () => {
    expect(parseColor('#0F5132')).toEqual(rgb('#0f5132'))
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColor('rgb(15, 81, 50)')).toEqual(rgb('#0f5132'))
    expect(parseColor('rgba(15 81 50 / 0.5)')).toEqual(rgb('#0f5132'))
    const hsl = parseColor('hsl(350 48% 27%)')!
    expect(hsl.r).toBeGreaterThan(hsl.g)
    const hslComma = parseColor('hsl(350, 48%, 27%)')!
    expect(hslComma).toEqual(hsl)
  })

  it('rejects garbage and empty values', () => {
    expect(parseColor('not-a-color')).toBeNull()
    expect(parseColor('')).toBeNull()
    expect(parseColor(null)).toBeNull()
    expect(parseColor('hsl(nope)')).toBeNull()
    expect(parseColor('rgb(1, 2)')).toBeNull()
  })
})

describe('color conversions', () => {
  it('round-trips hex through hsl', () => {
    const original = rgb('#0f5132')
    const round = hslToRgb(rgbToHsl(original))
    expect(Math.abs(round.r - original.r)).toBeLessThanOrEqual(1)
    expect(Math.abs(round.g - original.g)).toBeLessThanOrEqual(1)
    expect(Math.abs(round.b - original.b)).toBeLessThanOrEqual(1)
  })

  it('serializes hsl in the app syntax', () => {
    expect(hslToString({ h: 350.4, s: 0.48, l: 0.27 })).toBe('hsl(350 48% 27%)')
    expect(toHex(rgb('#0F5132'))).toBe('#0f5132')
  })
})

describe('contrast helpers', () => {
  it('computes WCAG luminance and contrast ratio', () => {
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2)
    expect(contrastRatio(rgb('#ffffff'), rgb('#000000'))).toBeCloseTo(21, 0)
  })

  it('picks the readable side of a background', () => {
    expect(readableTextOn('hsl(350 48% 27%)')).toBe('#fffdf9')
    expect(readableTextOn('hsl(40 80% 85%)')).toBe('#241318')
  })
})

describe('sanitizeColor', () => {
  it('normalizes valid colors and falls back on invalid input', () => {
    expect(sanitizeColor('#0F5132', '#000000')).toBe('#0f5132')
    expect(sanitizeColor('nonsense', '#123456')).toBe('#123456')
    expect(sanitizeColor(undefined, '#123456')).toBe('#123456')
  })
})

describe('buildShopTheme', () => {
  it('deepens any primary to the readable luminance bound', () => {
    const theme = buildShopTheme('#FFD700', '#FFD700')
    expect(luminance(hslToRgb(theme.primary))).toBeLessThanOrEqual(MAX_PRIMARY_LUMINANCE + 0.005)
    expect(theme.adjusted).toBe(true)
  })

  it('keeps already-readable brand colors untouched', () => {
    const theme = buildShopTheme('#0F5132', '#B7950B')
    expect(theme.adjusted).toBe(false)
    expect(toHex(hslToRgb(theme.primary))).toBe('#0f5132')
  })

  it('guarantees AA contrast for brand text on paper and light text on brand', () => {
    for (const color of ['#FFD700', '#0F5132', '#703030', '#1D4ED8', '#E8590C', '#000000']) {
      const theme = buildShopTheme(color, color)
      const primaryHex = toHex(hslToRgb(theme.primary))
      // brand-as-text on the cream/paper surfaces
      expect(contrastRatio(rgb(primaryHex), rgb('#fffdf9'))).toBeGreaterThanOrEqual(4.5)
      // light text on brand controls
      expect(contrastRatio(rgb(primaryHex), rgb(theme.onPrimary))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('derives a darker hover shade', () => {
    const theme = buildShopTheme('#0F5132', '#B7950B')
    expect(theme.primaryHover.l).toBeLessThan(theme.primary.l)
    expect(theme.primaryHover.h).toBeCloseTo(theme.primary.h, 1)
  })

  it('produces an 8-slice deterministic wheel palette in the shop colors', () => {
    const a = buildShopTheme('#0F5132', '#B7950B')
    const b = buildShopTheme('#0F5132', '#B7950B')
    expect(a.wheelPalette).toEqual(b.wheelPalette)
    expect(a.wheelPalette).toHaveLength(8)
    const c = buildShopTheme('#1D4ED8', '#F59E0B')
    expect(c.wheelPalette).not.toEqual(a.wheelPalette)
  })

  it('keeps every wheel slice dark enough for cream labels', () => {
    const theme = buildShopTheme('#FFD700', '#FF6B00')
    for (const slice of theme.wheelPalette) {
      expect(contrastRatio(rgb(slice), rgb('#fffdf9'))).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(rgb(theme.wheelStroke), rgb('#fffdf9'))).toBeGreaterThanOrEqual(1.2)
  })

  it('falls back to house colors when both inputs are invalid', () => {
    const theme = buildShopTheme('garbage', 'also garbage')
    expect(theme.adjusted).toBe(false)
    expect(theme.wheelPalette).toHaveLength(8)
  })
})

describe('buildWheelPalette', () => {
  it('alternates the two shop hues across slices', () => {
    const primary = { h: 146, s: 0.61, l: 0.19 }
    const secondary = { h: 45, s: 0.75, l: 0.45 }
    const palette = buildWheelPalette(primary, secondary)
    expect(palette).toHaveLength(8)
    expect(palette[0]).not.toBe(palette[1])
    // even slices carry the primary hue, odd slices the secondary hue
    expect(rgbToHsl(parseColor(palette[0])!).h).toBeCloseTo(primary.h, 0)
    expect(rgbToHsl(parseColor(palette[2])!).h).toBeCloseTo(primary.h, 0)
    expect(rgbToHsl(parseColor(palette[1])!).h).toBeCloseTo(secondary.h, 0)
    expect(rgbToHsl(parseColor(palette[3])!).h).toBeCloseTo(secondary.h, 0)
  })

  it('deepenToLuminance preserves hue and lowers lightness', () => {
    const deep = deepenToLuminance({ h: 60, s: 1, l: 0.5 }, MAX_PRIMARY_LUMINANCE)
    expect(deep.h).toBe(60)
    expect(deep.s).toBe(1)
    expect(deep.l).toBeLessThan(0.5)
    expect(luminance(hslToRgb(deep))).toBeLessThanOrEqual(MAX_PRIMARY_LUMINANCE + 0.005)
  })
})
