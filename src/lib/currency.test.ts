import { describe, it, expect } from 'vitest'
import { formatINR, formatINRNumber, parseINR, parseINRAmount, MIN_PURCHASE_AMOUNT, MAX_PURCHASE_AMOUNT } from './currency'

describe('currency formatting', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatINR(10000)).toBe('₹10,000')
    expect(formatINR(25000)).toBe('₹25,000')
    expect(formatINR(50000)).toBe('₹50,000')
    expect(formatINR(99999)).toBe('₹99,999')
    expect(formatINR(100000)).toBe('₹1,00,000')
    expect(formatINR(125000)).toBe('₹1,25,000')
    expect(formatINR(150000)).toBe('₹1,50,000')
    expect(formatINR(250000)).toBe('₹2,50,000')
    expect(formatINR(500000)).toBe('₹5,00,000')
    expect(formatINR(1000000)).toBe('₹10,00,000')
    expect(formatINR(2500000)).toBe('₹25,00,000')
    expect(formatINR(1500000)).toBe('₹15,00,000')
    expect(formatINR(0)).toBe('₹0')
  })

  it('never uses other currencies', () => {
    const out = formatINR(50000)
    expect(out.startsWith('₹')).toBe(true)
    expect(out).not.toContain('$')
    expect(out).not.toContain('USD')
    expect(out).not.toContain('EUR')
  })

  it('parses Indian-formatted input', () => {
    expect(parseINRAmount('₹1,00,000')).toBe(100000)
    expect(parseINR('₹1,25,000')).toBe(125000)
    expect(parseINRAmount('10000')).toBe(10000)
    expect(parseINRAmount('₹ 20,000')).toBe(20000)
    expect(parseINRAmount('abc')).toBeNull()
    expect(parseINRAmount('')).toBeNull()
  })

  it('enforces min/max bounds', () => {
    expect(MIN_PURCHASE_AMOUNT).toBe(10000)
    expect(MAX_PURCHASE_AMOUNT).toBeGreaterThanOrEqual(500000)
  })

  it('formats numbers without currency symbol when needed', () => {
    expect(formatINRNumber(100000)).toBe('1,00,000')
  })
})
