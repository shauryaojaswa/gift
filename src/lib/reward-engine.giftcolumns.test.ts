import { describe, expect, it } from 'vitest'
import {
  buildWheelOptions,
  buildWheelSegments,
  landingSegmentIndex,
} from './reward-engine'
import type { GiftColumnsConfig, Reward, RewardTier, StoreConfig } from '../types'

const NAMES = [
  'Gold Coin',
  'Silver Coin',
  'Diamond Pendant',
  'Gold Chain',
  'Silver Bracelet',
  'Pooja Thali',
  'Gift Voucher',
  'Mystery Gift',
]

function giftColumnsStore(): StoreConfig {
  const published = NAMES.map((name, i) => ({ name, rewardId: `slot-${i + 1}` }))
  const giftColumns: GiftColumnsConfig = {
    draft: [...NAMES],
    published,
    publishedAt: '2026-10-19T00:00:00.000Z',
  }
  return {
    id: 'store-1',
    slug: 'bcy',
    name: 'BCY Jewellers Private Limited',
    subtitle: 'CUSTOMER EXPERIENCE',
    logoUrl: '/logo-placeholder.svg',
    primaryColor: 'hsl(355 85% 45%)',
    secondaryColor: 'hsl(200 90% 55%)',
    googleReviewUrl: null,
    campaignBadge: null,
    minSpinAmount: 10000,
    status: 'active',
    giftColumns,
    rewards: published.map((slot) => ({
      id: slot.rewardId,
      name: slot.name,
      description: '',
      claimCodePrefix: null,
      validityText: null,
      active: true,
    })),
    tiers: [
      {
        id: 'tier-1',
        minAmount: 10000,
        maxAmount: null,
        rewardId: null,
        targetSegment: 0,
        active: true,
      },
    ],
  }
}

function assigned(reward: Reward, tier: RewardTier) {
  return { amount: 10000, tier, reward, targetSegment: tier.targetSegment }
}

describe('gift-columns wheel mapping - field i is segment i', () => {
  it('builds exactly 8 segments in field order', () => {
    const store = giftColumnsStore()
    const options = buildWheelOptions(store)
    const segments = buildWheelSegments(options)
    expect(segments).toHaveLength(8)
    expect(segments.map((s) => s.rewardName)).toEqual(NAMES)
    expect(segments.map((s) => s.rewardId)).toEqual(NAMES.map((_, i) => `slot-${i + 1}`))
  })

  it('lands on the segment of the assigned field', () => {
    const store = giftColumnsStore()
    const tier = store.tiers[0]
    for (let i = 0; i < NAMES.length; i += 1) {
      const reward = store.rewards[i]
      const result = assigned(reward, tier)
      const segments = buildWheelSegments(buildWheelOptions(store, result), result)
      expect(landingSegmentIndex(segments, result)).toBe(i)
      expect(segments[i].rewardName).toBe(NAMES[i])
    }
  })

  it('keeps the saved reward on its own segment even if the field was renamed after the award', () => {
    const store = giftColumnsStore()
    const tier = store.tiers[0]
    const savedReward: Reward = {
      id: 'slot-3',
      name: 'OLD NAME',
      shortLabel: 'OLD NAME',
      description: '',
      voucherValue: null,
      claimCodePrefix: null,
      validityText: null,
      active: true,
    }
    const result = assigned(savedReward, tier)
    const segments = buildWheelSegments(buildWheelOptions(store, result), result)
    expect(landingSegmentIndex(segments, result)).toBe(2)
    expect(segments[2].rewardName).toBe('OLD NAME')
  })

  it('never renders blank segments - blank fields cannot appear as prizes', () => {
    const store = giftColumnsStore()
    const cfg = store.giftColumns
    if (!cfg?.published) throw new Error('fixture must be published')
    cfg.published = cfg.published.map((slot, i) => (i === 4 ? { ...slot, name: '   ' } : slot))
    const segments = buildWheelSegments(buildWheelOptions(store))
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.some((s) => s.rewardName.trim() === '')).toBe(false)
    expect(segments.some((s) => s.rewardName.trim() === 'Gift 5')).toBe(false)
  })

  it('a never-published gift-columns shop advertises no prizes at all', () => {
    const store = giftColumnsStore()
    store.giftColumns = { draft: ['', '', '', '', '', '', '', ''], published: null, publishedAt: null }
    store.rewards = []
    expect(buildWheelOptions(store)).toEqual([])
    expect(buildWheelSegments(buildWheelOptions(store))).toEqual([])
    expect(landingSegmentIndex([], null)).toBe(-1)
  })
})
