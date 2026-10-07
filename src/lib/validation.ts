import { MIN_PURCHASE_AMOUNT, MAX_PURCHASE_AMOUNT, parseINRAmount } from './currency'

export interface ValidationResult {
  valid: boolean
  error: string | null
}

export function validateName(value: string): ValidationResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: false, error: 'Please enter your name.' }
  if (trimmed.length < 2) return { valid: false, error: 'Please enter a valid name.' }
  if (trimmed.length > 80) return { valid: false, error: 'Please enter a shorter name.' }
  if (!/^[\p{L}][\p{L}\p{M}\p{N} .'-]*$/u.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid name.' }
  }
  return { valid: true, error: null }
}

export function validatePurchaseAmount(
  raw: string,
  minAmount: number = MIN_PURCHASE_AMOUNT,
  maxAmount: number = MAX_PURCHASE_AMOUNT,
): ValidationResult {
  if (raw.trim() === '') return { valid: false, error: 'Please enter your purchase amount.' }
  const parsed = parseINRAmount(raw)
  if (parsed === null) return { valid: false, error: 'Please enter a valid purchase amount.' }
  if (parsed < 0) return { valid: false, error: 'Please enter a valid purchase amount.' }
  if (parsed < minAmount) {
    return {
      valid: false,
      error: `Spin & Win is available on purchases of ₹${minAmount.toLocaleString('en-IN')} and above.`,
    }
  }
  if (parsed > maxAmount) return { valid: false, error: 'Please verify your purchase amount.' }
  return { valid: true, error: null }
}

export function normalizePhone(value: string): string {
  const digits = (value.match(/\d/g) || []).join('')
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1)
  return digits
}

export function validatePhone(value: string): ValidationResult {
  if (value.trim().length === 0) {
    return { valid: false, error: 'Please enter a valid 10-digit mobile number.' }
  }
  const digits = (value.match(/\d/g) || []).join('')
  if (/^[6-9]\d{9}$/.test(digits)) return { valid: true, error: null }
  return { valid: false, error: 'Please enter a valid 10-digit mobile number.' }
}

export function isEmpty(value: string): boolean {
  return value.trim().length === 0
}
