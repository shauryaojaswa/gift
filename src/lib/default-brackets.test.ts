import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPurchaseTier } from './reward-engine'
import type { RewardTier, StoreConfig } from '../types'

/**
 * These tests parse the ACTUAL migration artifact that seeds the new-shop
 * default bracket template (platform_policies.default_brackets) — not a copy —
 * so the approved product rule and the deployed SQL can never drift apart.
 *
 * Approved template (2026-10-15 execution order), half-open [min, max):
 *   1. ₹1,000–₹10,000      7. ₹1,50,000–₹2,50,000
 *   2. ₹10,000–₹20,000     8. ₹2,50,000–₹5,00,000
 *   3. ₹20,000–₹40,000     9. ₹5,00,000–₹10,00,000
 *   4. ₹40,000–₹50,000    10. ₹10,00,000–₹20,00,000
 *   5. ₹50,000–₹1,00,000  11. ₹20,00,000 and above (open-ended)
 *   6. ₹1,00,000–₹1,50,000
 */

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20261015161000_platform_catalog_policies.sql',
)

interface TemplateBracket {
  min_amount: number
  max_amount: number | null
  target_segment: number
}

function loadSeededPolicies(): {
  brackets: TemplateBracket[]
  maxGiftSelections: number
  defaultMinSpin: number
} {
  const sql = readFileSync(MIGRATION_PATH, 'utf8')
  const bracketMatch = sql.match(/'default_brackets',\s*'(\[[\s\S]*?\])'::jsonb/)
  expect(bracketMatch, 'default_brackets seed must exist in the migration').toBeTruthy()
  const brackets = JSON.parse(bracketMatch![1]) as TemplateBracket[]

  const maxMatch = sql.match(/'max_gift_selections_per_bracket',\s*'(\d+)'::jsonb/)
  const minSpinMatch = sql.match(/'default_min_spin_amount',\s*'(\d+)'::jsonb/)
  return {
    brackets,
    maxGiftSelections: Number(maxMatch?.[1]),
    defaultMinSpin: Number(minSpinMatch?.[1]),
  }
}

const APPROVED: Array<[number, number | null]> = [
  [1000, 10000],
  [10000, 20000],
  [20000, 40000],
  [40000, 50000],
  [50000, 100000],
  [100000, 150000],
  [150000, 250000],
  [250000, 500000],
  [500000, 1000000],
  [1000000, 2000000],
  [2000000, null],
]

function toTiers(brackets: TemplateBracket[]): RewardTier[] {
  return brackets.map((b, index) => ({
    id: `tier-${index}`,
    minAmount: b.min_amount,
    maxAmount: b.max_amount,
    rewardId: null,
    targetSegment: b.target_segment,
    active: true,
  }))
}

describe('default bracket template (parsed from the applied migration)', () => {
  const { brackets, maxGiftSelections, defaultMinSpin } = loadSeededPolicies()

  it('contains exactly the eleven approved brackets', () => {
    expect(brackets).toHaveLength(11)
    expect(brackets.map((b) => [b.min_amount, b.max_amount])).toEqual(APPROVED)
  })

  it('is contiguous with no gaps or overlaps (each min equals previous max)', () => {
    for (let i = 1; i < brackets.length; i += 1) {
      expect(brackets[i].min_amount, `bracket ${i + 1} must start at bracket ${i}'s max`).toBe(
        brackets[i - 1].max_amount,
      )
    }
  })

  it('is half-open [min, max) with an open-ended top bracket', () => {
    for (const b of brackets.slice(0, -1)) {
      expect(b.max_amount).toBeGreaterThan(b.min_amount)
    }
    expect(brackets[brackets.length - 1].max_amount).toBeNull()
  })

  it('uses integer whole-rupee boundaries (no floating-point money)', () => {
    for (const b of brackets) {
      expect(Number.isInteger(b.min_amount)).toBe(true)
      if (b.max_amount !== null) expect(Number.isInteger(b.max_amount)).toBe(true)
    }
  })

  it('seeds platform limits: 4 gift selections max, ₹1,000 minimum spin for new shops', () => {
    expect(maxGiftSelections).toBe(4)
    expect(defaultMinSpin).toBe(1000)
    expect(brackets[0].min_amount).toBe(defaultMinSpin)
  })
})

describe('boundary resolution against the template (half-open semantics)', () => {
  const { brackets, defaultMinSpin } = loadSeededPolicies()
  const tiers = toTiers(brackets)
  const config: StoreConfig = {
    id: 'template-test',
    slug: 'template-test',
    name: 'Template Test',
    subtitle: 'TEST',
    logoUrl: '',
    primaryColor: '',
    secondaryColor: '',
    googleReviewUrl: null,
    campaignBadge: null,
    minSpinAmount: defaultMinSpin,
    rewards: [],
    tiers,
  }

  it('maps every boundary amount to the inclusive lower bracket', () => {
    for (let i = 0; i < APPROVED.length; i += 1) {
      const [min] = APPROVED[i]
      const tier = getPurchaseTier(min, config)
      expect(tier?.id, `₹${min} must fall in bracket ${i + 1}`).toBe(`tier-${i}`)
    }
  })

  it('maps the amount just below each boundary to the previous bracket', () => {
    for (let i = 1; i < APPROVED.length; i += 1) {
      const [min] = APPROVED[i]
      const tier = getPurchaseTier(min - 1, config)
      expect(tier?.id, `₹${min - 1} must fall in bracket ${i}`).toBe(`tier-${i - 1}`)
    }
  })

  it('treats each bracket maximum as exclusive (max amount lands in the next bracket)', () => {
    for (let i = 0; i < APPROVED.length - 1; i += 1) {
      const max = APPROVED[i][1] as number
      const tier = getPurchaseTier(max, config)
      expect(tier?.id, `₹${max} must fall in bracket ${i + 2}`).toBe(`tier-${i + 1}`)
    }
  })

  it('handles ₹1,000 exactly and rejects amounts below the minimum', () => {
    expect(getPurchaseTier(1000, config)?.id).toBe('tier-0')
    expect(getPurchaseTier(999, config)).toBeNull()
    expect(getPurchaseTier(0, config)).toBeNull()
    expect(getPurchaseTier(1, config)).toBeNull()
  })

  it('keeps the top bracket open-ended (any amount ≥ ₹20,00,000)', () => {
    expect(getPurchaseTier(2000000, config)?.id).toBe('tier-10')
    expect(getPurchaseTier(5000000, config)?.id).toBe('tier-10')
    expect(getPurchaseTier(100000000, config)?.id).toBe('tier-10')
    expect(getPurchaseTier(1999999, config)?.id).toBe('tier-9')
  })

  it('covers every amount above the floor — exactly one bracket matches', () => {
    // Deterministic sweep across all boundaries and midpoints.
    const probes: number[] = []
    for (const [min, max] of APPROVED) {
      probes.push(min, min + 1, min + Math.floor(((max ?? min * 2) - min) / 2))
      if (max !== null) probes.push(max - 1, max, max + 1)
    }
    for (const amount of probes) {
      const matches = tiers.filter(
        (t) => amount >= t.minAmount && (t.maxAmount === null || amount < t.maxAmount),
      )
      expect(matches.length, `₹${amount} must match exactly one bracket`).toBe(1)
    }
  })
})
