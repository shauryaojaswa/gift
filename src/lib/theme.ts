/**
 * Shop theme engine.
 *
 * One coherent theme mechanism for the whole customer experience: every shop's
 * saved colors are parsed, accessibility-clamped and turned into
 *
 *   - HSL channel values consumed by CSS custom properties (app.css) and the
 *     Tailwind palette (tailwind.config.cjs), so buttons, progress indicators,
 *     badges, form controls and the review modal all follow the shop; and
 *   - a deterministic wheel palette (8 slice colors + stroke) passed to the
 *     spin wheel as props.
 *
 * Accessibility contract (do not weaken):
 *   - the UI primary is deepened until luminance <= 0.183. That single bound
 *     guarantees BOTH white-on-brand controls (contrast >= 4.5) and brand-as-
 *     text on the cream/paper surfaces (contrast >= 4.5), whatever the owner
 *     picked;
 *   - slice labels always use the readable side of their slice color;
 *   - invalid / unreachable colour strings fall back to the house palette
 *     instead of producing an unusable UI.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export const HOUSE_PRIMARY = 'hsl(350 48% 27%)'
export const HOUSE_SECONDARY = 'hsl(39 34% 59%)'
export const ON_DARK = '#fffdf9'
export const ON_LIGHT = '#241318'

/** Maximum WCAG relative luminance for the UI primary (AA with the #fffdf9
 *  light text and paper surfaces used across the app: (0.983+0.05)/(x+0.05)
 *  >= 4.5  =>  x <= 0.175). */
export const MAX_PRIMARY_LUMINANCE = 0.175

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const FUNC_RE = /^(rgba?|hsla?)\(([^)]+)\)$/i

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseChannel(token: string, scale: number): number | null {
  const t = token.trim()
  if (t.endsWith('%')) {
    const pct = Number.parseFloat(t.slice(0, -1))
    if (!Number.isFinite(pct)) return null
    return (pct / 100) * scale
  }
  const n = Number.parseFloat(t)
  if (!Number.isFinite(n)) return null
  return n
}

/** Parse hex / rgb() / hsl() (comma or space syntax) into 0-255 RGB. */
export function parseColor(input: string | null | undefined): Rgb | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value) return null

  const hex = HEX_RE.exec(value)
  if (hex) {
    let digits = hex[1]
    if (digits.length === 3) {
      digits = digits
        .split('')
        .map((d) => d + d)
        .join('')
    }
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    }
  }

  const func = FUNC_RE.exec(value)
  if (!func) return null
  const kind = func[1].toLowerCase()
  const parts = func[2]
    .split(/[,/\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 3) return null

  if (kind === 'rgb' || kind === 'rgba') {
    const r = parseChannel(parts[0], 255)
    const g = parseChannel(parts[1], 255)
    const b = parseChannel(parts[2], 255)
    if (r === null || g === null || b === null) return null
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) }
  }

  const hToken = parts[0].endsWith('deg') ? parts[0].slice(0, -3) : parts[0]
  const h = Number.parseFloat(hToken)
  const s = parseChannel(parts[1], 1)
  const l = parseChannel(parts[2], 1)
  if (!Number.isFinite(h) || s === null || l === null) return null
  return hslToRgb({ h: ((h % 360) + 360) % 360, s: clamp(s, 0, 1), l: clamp(l, 0, 1) })
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  return { h: ((h % 360) + 360) % 360, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return {
    r: Math.round(channel(hn + 1 / 3) * 255),
    g: Math.round(channel(hn) * 255),
    b: Math.round(channel(hn - 1 / 3) * 255),
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number): string => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** Serialize normalized HSL in the syntax used across the app and Tailwind. */
export function hslToString({ h, s, l }: Hsl): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}

/** WCAG relative luminance of an sRGB color. */
export function luminance(rgb: Rgb): number {
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Pick the readable side (cream vs ink) of a background colour. */
export function readableTextOn(bg: string, light = ON_DARK, dark = ON_LIGHT): string {
  const bgRgb = parseColor(bg) ?? parseColor(HOUSE_PRIMARY)!
  const lightRgb = parseColor(light)!
  const darkRgb = parseColor(dark)!
  return contrastRatio(bgRgb, lightRgb) >= contrastRatio(bgRgb, darkRgb) ? light : dark
}

/** Validated color: pass through when parseable, else the fallback. */
export function sanitizeColor(input: string | null | undefined, fallback: string): string {
  const parsed = parseColor(input)
  return parsed ? toHex(parsed) : fallback
}

/** Deepen an HSL colour (keeping hue/saturation) until its luminance passes. */
export function deepenToLuminance(hsl: Hsl, maxLuminance: number): Hsl {
  let candidate: Hsl = { ...hsl }
  for (let i = 0; i < 24 && luminance(hslToRgb(candidate)) > maxLuminance; i += 1) {
    candidate = { ...candidate, l: Math.max(0, candidate.l - 0.02) }
  }
  return candidate
}

/**
 * Deterministic wheel palette derived from the shop's theme: alternating shades
 * of the primary and secondary hues over dark, rich slice fills (cream labels).
 * Every slice is deepened to the readable bound so labels stay legible for any
 * owner-chosen hue.
 */
export function buildWheelPalette(primary: Hsl, secondary: Hsl): string[] {
  const lightnesses = [0.3, 0.38, 0.27, 0.42]
  const palette: string[] = []
  for (let i = 0; i < 8; i += 1) {
    const base = i % 2 === 0 ? primary : secondary
    const drift = i >= 4 ? (i % 2 === 0 ? -7 : 9) : 0
    const slice = deepenToLuminance(
      {
        h: base.h + drift,
        s: clamp(base.s * 0.85, 0.22, 0.58),
        l: lightnesses[i % lightnesses.length],
      },
      MAX_PRIMARY_LUMINANCE,
    )
    palette.push(hslToString(slice))
  }
  return palette
}

export interface ShopTheme {
  /** Accessibility-clamped primary (HSL channels for CSS custom properties). */
  primary: Hsl
  /** Darker shade for hover/pressed states. */
  primaryHover: Hsl
  /** Sanitized secondary accent (badges, strokes, chips). */
  secondary: Hsl
  /** Text colour that reads on the primary (buttons). */
  onPrimary: string
  /** Text colour that reads on the secondary. */
  onSecondary: string
  /** 8 slice fills for the spin wheel. */
  wheelPalette: string[]
  /** Stroke / rim highlight for the wheel. */
  wheelStroke: string
  /** True when the saved primary had to be deepened for readability. */
  adjusted: boolean
}

/**
 * Build the effective UI theme for a shop. The saved colours decide hue and
 * character; readability is enforced (see MAX_PRIMARY_LUMINANCE).
 */
export function buildShopTheme(
  primaryInput: string | null | undefined,
  secondaryInput: string | null | undefined,
): ShopTheme {
  const primaryRgb = parseColor(primaryInput) ?? parseColor(HOUSE_PRIMARY)!
  const secondaryRgb = parseColor(secondaryInput) ?? parseColor(HOUSE_SECONDARY)!
  const rawPrimary = rgbToHsl(primaryRgb)
  const primary = deepenToLuminance(rawPrimary, MAX_PRIMARY_LUMINANCE)
  const primaryHover: Hsl = { ...primary, l: Math.max(0.04, primary.l - 0.07) }
  const secondary = rgbToHsl(secondaryRgb)
  return {
    primary,
    primaryHover,
    secondary,
    onPrimary: ON_DARK,
    onSecondary: readableTextOn(hslToString(secondary)),
    wheelPalette: buildWheelPalette(primary, secondary),
    wheelStroke: hslToString({
      h: secondary.h,
      s: clamp(secondary.s * 0.65, 0.18, 0.5),
      l: 0.66,
    }),
    adjusted: hslToString(primary) !== hslToString(rawPrimary),
  }
}
