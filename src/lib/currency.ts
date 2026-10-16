export const INR_LOCALE = 'en-IN'
export const INR_CURRENCY = 'INR'

const currencyFormatter = new Intl.NumberFormat(INR_LOCALE, {
  style: 'currency',
  currency: INR_CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat(INR_LOCALE, {
  maximumFractionDigits: 0,
})

export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0'
  return currencyFormatter.format(amount)
}

export function formatINRNumber(amount: number): string {
  if (!Number.isFinite(amount)) return '0'
  return numberFormatter.format(amount)
}

function trimCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

/**
 * Compact Indian currency for chips and wheel labels:
 * 10000 -> ₹10K, 150000 -> ₹1.5L, 2000000 -> ₹20L, 10000000 -> ₹1Cr.
 */
export function formatCompactINR(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '₹0'
  const abs = Math.abs(amount)
  if (abs >= 10000000) return `₹${trimCompact(amount / 10000000)}Cr`
  if (abs >= 100000) return `₹${trimCompact(amount / 100000)}L`
  if (abs >= 1000) return `₹${trimCompact(amount / 1000)}K`
  return formatINR(amount)
}

export function parseINR(input: string): number | null {
  const cleaned = input.replace(/₹/g, '').replace(/,/g, '').replace(/\s/g, '').trim()
  if (cleaned === '') return null
  const numeric = Number(cleaned)
  if (!Number.isFinite(numeric)) return null
  return numeric
}

export const parseINRAmount = parseINR

export const MIN_PURCHASE_AMOUNT = 10000
export const MAX_PURCHASE_AMOUNT = 100000000
