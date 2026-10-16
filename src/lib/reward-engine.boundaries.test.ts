import { describe, expect, it } from 'vitest'
import {
  buildWheelSegments,
  getAwardableOptions,
  getPurchaseTier,
  landingSegmentIndex,
  validateTierConfiguration,
} from './reward-engine'
import { displayLabel } from '../components/ui/SpinWheel'
import type { GiftOption, Reward, RewardResult, RewardTier, StoreConfig } from '../types'

/**
 * Shree Jewellers purchase brackets (commissioned configuration, transcribed
 * from the supplied prize sheet):
 *
 *   ₹5,000 to below ₹15,000      Bag + ₹1,200 Saree Coupon
 *   ₹15,000 to below ₹50,000     three alternatives, each + ₹1,200 Saree Coupon
 *   ₹50,000 to below ₹1,00,000   Big Bluetooth Speaker or Bluetooth Headband
 *   ₹1,00,000 to below ₹2,00,000 Dinner Set
 *   ₹2,00,000 and above          Mixer Grinder
 *
 * Tier 3's written sheet had a trailing "+" with no legible prize; it is NOT
 * interpreted as a prize - only the two readable gifts are configured (see the
 * pool assertion below).
 *
 * Prize bundles are represented as complete named prizes, so every saved
 * reward snapshot carries the whole bundle including the ₹1,200 Saree Coupon.
 */

const option = (id: string, name: string): GiftOption => ({
  id,
  name,
  wheelLabel: name,
  description: '',
  voucherValue: null,
})

const reward = (id: string, name: string): Reward => ({
  id,
  name,
  shortLabel: name,
  description: '',
  voucherValue: null,
  claimCodePrefix: null,
  validityText: null,
  active: true,
})

const rewards: Reward[] = [
  reward('r-bag', 'Bag + ₹1,200 Saree Coupon'),
  reward('r-speaker-s', 'Small Bluetooth Speaker + ₹1,200 Saree Coupon'),
  reward('r-saree', 'Saree + ₹1,200 Saree Coupon'),
  reward('r-headband-c', 'Bluetooth Headband + ₹1,200 Saree Coupon'),
  reward('r-speaker-l', 'Big Bluetooth Speaker'),
  reward('r-headband', 'Bluetooth Headband'),
  reward('r-dinner', 'Dinner Set'),
  reward('r-mixer', 'Mixer Grinder'),
]

const tiers: RewardTier[] = [
  {
    id: 't1',
    minAmount: 5000,
    maxAmount: 15000,
    rewardId: null,
    targetSegment: 0,
    active: true,
    giftOptions: [option('r-bag', 'Bag + ₹1,200 Saree Coupon')],
  },
  {
    id: 't2',
    minAmount: 15000,
    maxAmount: 50000,
    rewardId: null,
    targetSegment: 1,
    active: true,
    giftOptions: [
      option('r-speaker-s', 'Small Bluetooth Speaker + ₹1,200 Saree Coupon'),
      option('r-saree', 'Saree + ₹1,200 Saree Coupon'),
      option('r-headband-c', 'Bluetooth Headband + ₹1,200 Saree Coupon'),
    ],
  },
  {
    id: 't3',
    minAmount: 50000,
    maxAmount: 100000,
    rewardId: null,
    targetSegment: 2,
    active: true,
    giftOptions: [
      option('r-speaker-l', 'Big Bluetooth Speaker'),
      option('r-headband', 'Bluetooth Headband'),
    ],
  },
  {
    id: 't4',
    minAmount: 100000,
    maxAmount: 200000,
    rewardId: null,
    targetSegment: 3,
    active: true,
    giftOptions: [option('r-dinner', 'Dinner Set')],
  },
  {
    id: 't5',
    minAmount: 200000,
    maxAmount: null,
    rewardId: null,
    targetSegment: 4,
    active: true,
    giftOptions: [option('r-mixer', 'Mixer Grinder')],
  },
]

const config: StoreConfig = {
  id: 'store-shree',
  slug: 'shreejwellers',
  name: 'Shree Jewellers',
  subtitle: '',
  logoUrl: '',
  primaryColor: 'hsl(45 80% 45%)',
  secondaryColor: 'hsl(355 70% 35%)',
  googleReviewUrl: null,
  campaignBadge: null,
  minSpinAmount: 5000,
  status: 'active',
  rewards,
  tiers,
}

const assignedFor = (tierId: string, rewardId: string): RewardResult => {
  const tier = tiers.find((t) => t.id === tierId)!
  const r = rewards.find((x) => x.id === rewardId)!
  return { amount: tier.minAmount, tier, reward: r, targetSegment: tier.targetSegment }
}

describe('Shree Jewellers purchase brackets', () => {
  const cases: Array<[number, string | null]> = [
    [4999, null],
    [5000, 't1'],
    [14999, 't1'],
    [15000, 't2'],
    [49999, 't2'],
    [50000, 't3'],
    [99999, 't3'],
    [100000, 't4'],
    [199999, 't4'],
    [200000, 't5'],
    [250000, 't5'],
  ]

  for (const [amount, expectedTier] of cases) {
    it(`maps ₹${amount.toLocaleString('en-IN')} to ${expectedTier ?? 'no tier (below minimum)'}`, () => {
      const tier = getPurchaseTier(amount, config)
      expect(tier?.id ?? null).toBe(expectedTier)
    })
  }

  it('maps every boundary amount to exactly one tier', () => {
    for (const [amount] of cases) {
      const matches = config.tiers.filter(
        (t) => t.active && amount >= t.minAmount && (t.maxAmount === null || amount < t.maxAmount),
      )
      expect(matches.length).toBeLessThanOrEqual(1)
    }
  })

  it('is a valid, gap-free, overlap-free tier configuration', () => {
    expect(validateTierConfiguration(config.tiers, config.minSpinAmount, config.rewards)).toBeNull()
  })
})

describe('Shree Jewellers prize bundles', () => {
  it('Tier 1 is the single combined reward incl. the ₹1,200 Saree Coupon', () => {
    const pool = getAwardableOptions(tiers[0], config)
    expect(pool.map((o) => o.name)).toEqual(['Bag + ₹1,200 Saree Coupon'])
  })

  it('Tier 2 has three alternatives, each combined with the ₹1,200 Saree Coupon', () => {
    const pool = getAwardableOptions(tiers[1], config)
    expect(pool.map((o) => o.name)).toEqual([
      'Small Bluetooth Speaker + ₹1,200 Saree Coupon',
      'Saree + ₹1,200 Saree Coupon',
      'Bluetooth Headband + ₹1,200 Saree Coupon',
    ])
    for (const o of pool) expect(o.name).toContain('₹1,200 Saree Coupon')
  })

  it('Tier 3 has exactly the two legible gifts - the trailing "+" is not a prize', () => {
    const pool = getAwardableOptions(tiers[2], config)
    expect(pool.map((o) => o.name)).toEqual(['Big Bluetooth Speaker', 'Bluetooth Headband'])
  })

  it('Tiers 4 and 5 are Dinner Set and Mixer Grinder', () => {
    expect(getAwardableOptions(tiers[3], config).map((o) => o.name)).toEqual(['Dinner Set'])
    expect(getAwardableOptions(tiers[4], config).map((o) => o.name)).toEqual(['Mixer Grinder'])
  })

  it('never conceals the coupon on the wheel: every bundle slice shows the full bundle name', () => {
    for (const tier of tiers) {
      const pool = getAwardableOptions(tier, config)
      const segments = buildWheelSegments(pool)
      for (const segment of segments) {
        const source = pool.find((o) => o.id === segment.rewardId)!
        expect(segment.rewardName).toBe(source.wheelLabel)
        if (source.name.includes('Saree Coupon')) {
          expect(segment.rewardName).toContain('₹1,200 Saree Coupon')
        }
      }
    }
  })

  it('the wheel lands exactly on the saved reward slice for every pool position', () => {
    for (const tier of tiers) {
      const pool = getAwardableOptions(tier, config)
      for (const option of pool) {
        const saved = assignedFor(tier.id, option.id)
        const segments = buildWheelSegments(pool, saved)
        const landing = landingSegmentIndex(segments, saved)
        expect(landing).toBeGreaterThanOrEqual(0)
        expect(segments[landing].rewardId).toBe(saved.reward.id)
        expect(segments[landing].rewardName).toContain(saved.reward.name.split(' + ')[0])
      }
    }
  })

  it('draws the complete bundle name on the wheel - the coupon is never concealed', () => {
    const bundles = rewards.filter((r) => r.name.includes('+'))
    expect(bundles.length).toBe(4)
    for (const bundle of bundles) {
      const drawn = displayLabel(bundle.name, 8).join(' ')
      // The drawn label is the complete bundle name (uppercased) - item AND
      // coupon component - with nothing dropped or abbreviated.
      expect(drawn).toBe(bundle.name.toUpperCase())
      expect(drawn).toContain('COUPON')
      expect(drawn).toContain('₹1,200')
    }
  })

  it('keeps the established concise/truncated behaviour for plain gift names', () => {
    expect(displayLabel('Dinner Set', 8)).toEqual(['DINNER SET'])
    expect(displayLabel('Mixer Grinder', 8)).toEqual(['MIXER', 'GRINDER'])
    expect(displayLabel('Jewellery Cleaning', 8)).toEqual(['CLEANING'])
    // A plain name that cannot fit keeps its noun family with the established
    // honest truncation marker (v1.2.0 wheel contract, unchanged).
    expect(displayLabel('Big Bluetooth Speaker', 8)).toEqual(['BIG', 'BLUETOOTH…'])
  })
})
