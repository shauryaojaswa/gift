import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  validateTierRanges,
  validateRewardName,
  validateUrl,
  formatTierRange,
  csvCell,
  toCsv,
  getCampaignUrl,
} from './lib'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validateTierRanges', () => {
  it('accepts a valid non-overlapping ascending set with an open top tier', () => {
    expect(
      validateTierRanges([
        { id: 'a', minAmount: 10000, maxAmount: 20000 },
        { id: 'b', minAmount: 20000, maxAmount: 40000 },
        { id: 'c', minAmount: 40000, maxAmount: null },
      ]),
    ).toBeNull()
  })

  it('rejects an empty set', () => {
    expect(validateTierRanges([])).toMatch(/at least one/i)
  })

  it('rejects a zero or negative minimum', () => {
    expect(validateTierRanges([{ id: 'a', minAmount: 0, maxAmount: 100 }])).toMatch(/greater than/i)
  })

  it('rejects a maximum that is not greater than its minimum', () => {
    expect(validateTierRanges([{ id: 'a', minAmount: 100, maxAmount: 100 }])).toMatch(/greater than/i)
  })

  it('rejects overlapping ranges regardless of input order', () => {
    expect(
      validateTierRanges([
        { id: 'b', minAmount: 15000, maxAmount: 25000 },
        { id: 'a', minAmount: 10000, maxAmount: 20000 },
      ]),
    ).toMatch(/overlap/i)
  })

  it('rejects a non-top uncapped tier that would swallow later tiers', () => {
    expect(
      validateTierRanges([
        { id: 'a', minAmount: 10000, maxAmount: null },
        { id: 'b', minAmount: 20000, maxAmount: 30000 },
      ]),
    ).toMatch(/only the highest/i)
  })
})

describe('validateRewardName', () => {
  it('rejects empty names', () => {
    expect(validateRewardName('   ')).toMatch(/required/i)
  })
  it('rejects over-long names', () => {
    expect(validateRewardName('x'.repeat(81))).toMatch(/80 characters/i)
  })
  it('accepts a normal name', () => {
    expect(validateRewardName('₹500 Voucher')).toBeNull()
  })
})

describe('validateUrl', () => {
  it('allows empty values (optional fields)', () => {
    expect(validateUrl('')).toBeNull()
    expect(validateUrl('   ')).toBeNull()
  })
  it('accepts http and https URLs', () => {
    expect(validateUrl('https://gift.example.com/store/x')).toBeNull()
    expect(validateUrl('http://localhost:4173')).toBeNull()
  })
  it('rejects non-http schemes and malformed input', () => {
    expect(validateUrl('javascript:alert(1)')).toMatch(/valid/i)
    expect(validateUrl('not a url')).toMatch(/valid/i)
  })
})

describe('formatTierRange', () => {
  it('formats a capped range with en-IN grouping', () => {
    expect(formatTierRange(10000, 20000)).toContain('10,000')
    expect(formatTierRange(100000, 150000)).toContain('1,00,000')
  })
  it('formats an open top tier with a plus', () => {
    expect(formatTierRange(500000, null)).toMatch(/\+$/)
  })
})

describe('CSV escaping', () => {
  it('wraps and doubles quotes and commas', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })
  it('renders null/undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
  it('builds a document with header, CRLF rows and trailing newline', () => {
    const csv = toCsv(
      [{ name: 'Asha', amount: 125000 }],
      [
        { header: 'Name', value: (r) => r.name },
        { header: 'Amount', value: (r) => r.amount },
      ],
    )
    expect(csv).toBe('Name,Amount\r\nAsha,125000\r\n')
  })
})

describe('getCampaignUrl', () => {
  it('builds a store URL from the configured public origin when set', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://gift-alpha-pearl.vercel.app/')
    expect(getCampaignUrl('jolly-enterprises')).toBe(
      'https://gift-alpha-pearl.vercel.app/store/jolly-enterprises',
    )
  })
})
