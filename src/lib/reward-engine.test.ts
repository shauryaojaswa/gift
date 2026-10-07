import { describe, it, expect } from 'vitest'
import { getPurchaseTier, getRewardForAmount, evaluateReward, buildSegments, getWheelTargetSegment } from './reward-engine'
import { JOLLY_ENTERPRISES } from './stores'

const cfg = JOLLY_ENTERPRISES

describe('reward-engine tier boundaries', () => {
  const cases: Array<[number, string | null]> = [
    [9999, null],
    [10000, 'tier_1'],
    [19999, 'tier_1'],
    [20000, 'tier_2'],
    [39999, 'tier_2'],
    [40000, 'tier_3'],
    [49999, 'tier_3'],
    [50000, 'tier_4'],
    [99999, 'tier_4'],
    [100000, 'tier_5'],
    [149999, 'tier_5'],
    [150000, 'tier_6'],
    [249999, 'tier_6'],
    [250000, 'tier_7'],
    [499999, 'tier_7'],
    [500000, 'tier_8'],
    [10000000, 'tier_8'],
  ]

  for (const [amount, expectedTierId] of cases) {
    it(`₹${amount.toLocaleString('en-IN')} maps to ${expectedTierId ?? 'no tier'}`, () => {
      const tier = getPurchaseTier(amount, cfg)
      expect(tier?.id ?? null).toBe(expectedTierId)
    })
  }

  it('each boundary maps to exactly one tier (no gaps)', () => {
    const boundaries = [9999, 10000, 19999, 20000, 39999, 40000, 49999, 50000, 99999, 100000, 149999, 150000, 249999, 250000, 499999, 500000]
    for (let i = 0; i < boundaries.length - 1; i++) {
      const lower = boundaries[i] + 1
      const upper = boundaries[i + 1]
      const tierLower = getPurchaseTier(lower, cfg)?.id
      const tierUpper = getPurchaseTier(upper, cfg)?.id
      expect(tierLower).toBe(tierUpper)
    }
  })

  it('negative amount returns no tier', () => {
    expect(getPurchaseTier(-100, cfg)).toBeNull()
  })

  it('amount below min spin amount returns no tier', () => {
    expect(getPurchaseTier(5000, cfg)).toBeNull()
  })
})

describe('reward resolution', () => {
  it('resolves the reward for each tier', () => {
    expect(getRewardForAmount(10000, cfg)?.id).toBe('reward_1')
    expect(getRewardForAmount(20000, cfg)?.id).toBe('reward_2')
    expect(getRewardForAmount(500000, cfg)?.id).toBe('reward_8')
  })

  it('below minimum returns null reward', () => {
    expect(getRewardForAmount(5000, cfg)).toBeNull()
  })

  it('evaluateReward returns deterministic result', () => {
    const r1 = evaluateReward(25000, cfg)
    const r2 = evaluateReward(25000, cfg)
    expect(r1).toEqual(r2)
    expect(r1?.reward.id).toBe('reward_2')
    expect(r1?.targetSegment).toBe(1)
  })

  it('getWheelTargetSegment returns the tier segment for a reward', () => {
    expect(getWheelTargetSegment('reward_1', cfg)).toBe(0)
    expect(getWheelTargetSegment('reward_8', cfg)).toBe(7)
  })

  it('buildSegments produces one segment per tier, ordered', () => {
    const segments = buildSegments(cfg)
    expect(segments.length).toBe(8)
    expect(segments.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(segments[0].rewardId).toBe('reward_1')
    expect(segments[7].rewardId).toBe('reward_8')
  })
})

describe('premium reward mapping (deterministic by purchase amount)', () => {
  const matrix: Array<[number, string]> = [
    [10000, 'JEWELLERY CLEANING'],
    [19999, 'JEWELLERY CLEANING'],
    [20000, 'CARE KIT'],
    [39999, 'CARE KIT'],
    [40000, '₹500 VOUCHER'],
    [49999, '₹500 VOUCHER'],
    [50000, 'PREMIUM GIFT'],
    [99999, 'PREMIUM GIFT'],
    [100000, '₹1,000 VOUCHER'],
    [125000, '₹1,000 VOUCHER'],
    [149999, '₹1,000 VOUCHER'],
    [150000, 'SILVER GIFT'],
    [249999, 'SILVER GIFT'],
    [250000, '₹2,500 VOUCHER'],
    [499999, '₹2,500 VOUCHER'],
    [500000, '₹5,000 VOUCHER'],
  ]

  for (const [amount, expectedName] of matrix) {
    it(`₹${amount.toLocaleString('en-IN')} → ${expectedName}`, () => {
      const res = evaluateReward(amount, cfg)
      expect(res?.reward.name).toBe(expectedName)
    })
  }

  it('₹9,999 is not eligible', () => {
    expect(evaluateReward(9999, cfg)).toBeNull()
  })

  it('maps each reward to its deterministic target segment', () => {
    expect(evaluateReward(10000, cfg)?.targetSegment).toBe(0)
    expect(evaluateReward(100000, cfg)?.targetSegment).toBe(4)
    expect(evaluateReward(125000, cfg)?.targetSegment).toBe(4)
    expect(evaluateReward(500000, cfg)?.targetSegment).toBe(7)
  })
})
