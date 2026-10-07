import { describe, it, expect } from 'vitest'
import { validateName, validatePhone, validatePurchaseAmount, normalizePhone } from './validation'

describe('validation - name', () => {
  it('accepts valid names', () => {
    expect(validateName('Priya Sharma').valid).toBe(true)
    expect(validateName('  Raj K.  ').valid).toBe(true)
    expect(validateName('Test Customer 2').valid).toBe(true)
    expect(validateName('आर्या देशमुख').valid).toBe(true)
  })
  it('rejects empty / too short / invalid', () => {
    expect(validateName('').valid).toBe(false)
    expect(validateName('A').valid).toBe(false)
    expect(validateName('123 Numbers').valid).toBe(false)
    expect(validateName('   ').valid).toBe(false)
  })
})

describe('validation - phone', () => {
  it('accepts valid Indian numbers in many forms', () => {
    expect(validatePhone('9876543210').valid).toBe(true)
  })
  it('requires exactly ten digits for an Indian mobile number', () => {
    expect(validatePhone('+919876543210').valid).toBe(false)
    expect(validatePhone('919876543210').valid).toBe(false)
    expect(validatePhone('09876543210').valid).toBe(false)
    expect(validatePhone('987654321').valid).toBe(false)
    expect(validatePhone('98765432101').valid).toBe(false)
    expect(validatePhone('').error).toBe('Please enter a valid 10-digit mobile number.')
  })
  it('rejects invalid', () => {
    expect(validatePhone('').valid).toBe(false)
    expect(validatePhone('123456789').valid).toBe(false) // starts with 1, 9 digits
    expect(validatePhone('888').valid).toBe(false)
    expect(validatePhone('abcdefghij').valid).toBe(false)
  })
  it('normalizes to 10 digits', () => {
    expect(normalizePhone('9876543210')).toBe('9876543210')
    expect(normalizePhone('+919876543210')).toBe('9876543210')
    expect(normalizePhone('09876543210')).toBe('9876543210')
  })
})

describe('validation - purchase amount', () => {
  it('rejects below minimum', () => {
    expect(validatePurchaseAmount('9999').valid).toBe(false)
    expect(validatePurchaseAmount('₹9,999').valid).toBe(false)
  })
  it('accepts minimum and above', () => {
    expect(validatePurchaseAmount('10000').valid).toBe(true)
    expect(validatePurchaseAmount('₹1,00,000').valid).toBe(true)
    expect(validatePurchaseAmount('₹1,25,000').valid).toBe(true)
    expect(validatePurchaseAmount('500000').valid).toBe(true)
  })
  it('rejects negative and non-numeric', () => {
    expect(validatePurchaseAmount('-100').valid).toBe(false)
    expect(validatePurchaseAmount('abc').valid).toBe(false)
    expect(validatePurchaseAmount('').valid).toBe(false)
  })
})
