export const MIN_PURCHASE_AMOUNT = 10000
export const MAX_PURCHASE_AMOUNT = 100000000

/** Validate a customer full name. Returns an error string, or null when valid. */
export function nameError(value) {
  const trimmed = String(value ?? '').trim()
  if (trimmed.length === 0) return 'Please enter your name.'
  if (trimmed.length < 2) return 'Please enter a valid name.'
  if (trimmed.length > 80) return 'Please enter a shorter name.'
  if (!/^[\p{L}][\p{L}\p{M}\p{N} .'-]*$/u.test(trimmed)) return 'Please enter a valid name.'
  return null
}

/** Normalise an Indian mobile number to its 10-digit form. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1)
  return digits
}

export function phoneError(value) {
  const digits = normalizePhone(value)
  if (/^[6-9]\d{9}$/.test(digits)) return null
  return 'Please enter a valid 10-digit mobile number.'
}

export function purchaseAmountError(value, minAmount = MIN_PURCHASE_AMOUNT, maxAmount = MAX_PURCHASE_AMOUNT) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'Please enter a valid purchase amount.'
  if (amount < minAmount) {
    return `Spin & Win is available on purchases of ₹${minAmount.toLocaleString('en-IN')} and above.`
  }
  if (amount > maxAmount) return 'Please verify your purchase amount.'
  return null
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

/** URL-safe slug from a display name. */
export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function isValidSlug(value) {
  return /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(String(value ?? ''))
}
