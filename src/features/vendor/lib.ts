import type { RewardTier } from '@/types'

/**
 * Canonical public campaign URL for a store slug (root-level: `/{slug}`).
 * - Uses VITE_PUBLIC_APP_URL when configured (the canonical production domain),
 *   so the QR always points at real customers even if the dashboard is served
 *   from a preview/staging host.
 * - Otherwise falls back to the current origin + Vite base, which works on both
 *   the root build (base "/") and GitHub Pages (base "/gift/").
 * Never points at an admin URL, the vendor dashboard, or localhost in production.
 */
export function getCampaignUrl(slug: string): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim()
  if (configured) {
    const base = configured.replace(/\/$/, '')
    return `${base}/${slug}`
  }
  const basePath = ((import.meta.env.BASE_URL as string | undefined) ?? '/').replace(/\/$/, '')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (!basePath || basePath === '/') return `${origin}/${slug}`
  return `${origin}${basePath}/${slug}`
}

export interface TierRange {
  id: string
  minAmount: number
  maxAmount: number | null
}

/**
 * Validate that reward tiers form a valid, non-overlapping set of ranges.
 * Returns an error message string, or null when valid.
 * - Every minimum must be > 0.
 * - A maximum, when set, must be strictly greater than its minimum.
 * - Ranges must be strictly increasing and must not overlap.
 */
export function validateTierRanges(tiers: TierRange[]): string | null {
  if (tiers.length === 0) return 'Add at least one reward tier.'
  for (const t of tiers) {
    if (!(t.minAmount > 0)) return 'Each tier minimum must be greater than ₹0.'
    if (t.maxAmount !== null && t.maxAmount <= t.minAmount) {
      return 'A tier maximum must be greater than its minimum.'
    }
  }
  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    // An open-ended (uncapped) tier that is not last would swallow later tiers.
    if (prev.maxAmount === null) {
      return 'Only the highest tier may have no maximum. Remove the cap from a lower tier or add a maximum.'
    }
    if (cur.minAmount < prev.maxAmount) {
      return `Reward tiers overlap: ₹${prev.minAmount}–₹${prev.maxAmount} overlaps ₹${cur.minAmount}${cur.maxAmount ? `–₹${cur.maxAmount}` : '+'}.`
    }
  }
  return null
}

export function validateRewardName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Reward name is required.'
  if (trimmed.length > 80) return 'Reward name must be 80 characters or fewer.'
  return null
}

/** Validate a URL field; empty is allowed (returns null). */
export function validateUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'Enter a valid http(s) URL.'
    }
    return null
  } catch {
    return 'Enter a valid URL.'
  }
}

export function rewardTierRanges(tiers: RewardTier[]): TierRange[] {
  return tiers.map((t) => ({ id: t.id, minAmount: t.minAmount, maxAmount: t.maxAmount }))
}

/** Human-readable INR range for a tier, e.g. "₹10,000 – ₹20,000" or "₹5,00,000+". */
export function formatTierRange(minAmount: number, maxAmount: number | null): string {
  const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
  const lo = fmt.format(minAmount)
  if (maxAmount === null) return `${lo}+`
  return `${lo} – ${fmt.format(maxAmount)}`
}

/** ISO timestamp -> "12 Jun 2026, 3:45 pm" in en-IN. Returns "" for null. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** RFC-4180 CSV cell escaping (quotes doubled, wrapped when needed). */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

/** Build a CSV document (with trailing newline) from rows. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(',')).join('\r\n')
  return `${header}\r\n${body}\r\n`
}

/** Trigger a browser download of text content with a given filename. */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

