import { describe, expect, it } from 'vitest'
import { buildSegments, validateTierConfiguration, getPurchaseTier, type RewardResult } from './reward-engine'
import type { Reward, RewardTier, StoreConfig } from '../types'

/**
 * Pool-bracket (Option B) behaviour of the client-side presentation layer.
 * Prize selection is server-side and tested in scripts/staging-verify.mjs;
 * these tests cover the wheel rendering contract: placeholders for pools,
 * the saved reward always winning, and validation of nullable legacy gifts.
 */

const reward = (id: string, name: string, shortLabel?: string): Reward => ({
  id,
  name,
  shortLabel,
  description: `${name} description`,
  voucherValue: null,
  claimCodePrefix: 'GIFT',
  validityText: null,
  active: true,
})

const tier = (id: string, min: number, max: number | null, rewardId: string | null, segment: number): RewardTier => ({
  id,
  minAmount: min,
  maxAmount: max,
  rewardId,
  targetSegment: segment,
  active: true,
})

const store = (rewards: Reward[], tiers: RewardTier[]): StoreConfig => ({
  id: 'store-1',
  slug: 'store-1',
  name: 'Store One',
  subtitle: 'TEST',
  logoUrl: '',
  primaryColor: '',
  secondaryColor: '',
  googleReviewUrl: null,
  campaignBadge: null,
  minSpinAmount: 1000,
  rewards,
  tiers,
})

describe('buildSegments with pool brackets', () => {
  const rewards = [reward('r1', 'Legacy Gift')]
  const tiers = [
    tier('t1', 1000, 10000, null, 0),
    tier('t2', 10000, 20000, null, 1),
    tier('t3', 20000, null, 'r1', 2),
  ]

  it('renders placeholder segments for pool tiers instead of dropping them', () => {
    const segments = buildSegments(store(rewards, tiers))
    expect(segments).toHaveLength(3)
    expect(segments.map((s) => s.index)).toEqual([0, 1, 2])
    expect(segments[0].rewardName).toBe('GIFT')
    expect(segments[1].rewardName).toBe('GIFT')
    expect(segments[2].rewardName).toBe('Legacy Gift')
  })

  it('overrides the assigned segment with the saved reward so the wheel lands on it', () => {
    const assigned: RewardResult = {
      amount: 15000,
      tier: tiers[1],
      reward: reward('pool-pick', 'Silver Coin'),
      targetSegment: 1,
    }
    const segments = buildSegments(store(rewards, tiers), assigned)
    expect(segments[1].rewardName).toBe('Silver Coin')
    expect(segments[1].rewardId).toBe('pool-pick')
    // other segments unchanged
    expect(segments[0].rewardName).toBe('GIFT')
  })

  it('never lets configuration override an assigned reward', () => {
    const assigned: RewardResult = {
      amount: 15000,
      tier: tiers[1],
      reward: reward('pool-pick', 'Assigned Name'),
      targetSegment: 1,
    }
    const segments = buildSegments(store([], [tier('t2', 10000, 20000, null, 1)]), assigned)
    expect(segments).toHaveLength(1)
    expect(segments[0].rewardName).toBe('Assigned Name')
  })

  it('uses the short wheel label when the assigned reward provides one', () => {
    const assigned: RewardResult = {
      amount: 15000,
      tier: tiers[1],
      reward: { ...reward('pool-pick', 'Silver Coin Gift Box'), shortLabel: 'SILVER COIN' },
      targetSegment: 1,
    }
    const segments = buildSegments(store(rewards, tiers), assigned)
    expect(segments[1].rewardName).toBe('SILVER COIN')
  })
})

describe('validateTierConfiguration with pool brackets', () => {
  const rewards = [reward('r1', 'Legacy Gift'), reward('r2', 'Other Gift')]

  it('accepts pool tiers with no legacy gift', () => {
    const tiers = [
      tier('t1', 1000, 10000, null, 0),
      tier('t2', 10000, 20000, null, 1),
      tier('t3', 20000, null, 'r1', 2),
    ]
    expect(validateTierConfiguration(tiers, 1000, rewards)).toBeNull()
  })

  it('still rejects legacy tiers pointing at an inactive or missing gift', () => {
    const tiers = [
      tier('t1', 1000, 10000, 'missing', 0),
      tier('t2', 10000, null, 'r1', 1),
    ]
    expect(validateTierConfiguration(tiers, 1000, rewards)).toBe('Every active tier must use an active gift.')
  })

  it('still rejects different legacy gifts sharing a wheel segment', () => {
    const tiers = [
      tier('t1', 1000, 10000, 'r1', 0),
      tier('t2', 10000, 20000, 'r2', 0),
      tier('t3', 20000, null, 'r1', 1),
    ]
    expect(validateTierConfiguration(tiers, 1000, rewards)).toBe(
      'Different gifts cannot use the same wheel segment.',
    )
  })

  it('does not apply the segment rule to pool tiers (segments are display hints)', () => {
    const tiers = [
      tier('t1', 1000, 10000, null, 0),
      tier('t2', 10000, 20000, null, 0),
      tier('t3', 20000, null, 'r1', 0),
    ]
    expect(validateTierConfiguration(tiers, 1000, rewards)).toBeNull()
  })

  it('keeps contiguity and open-top rules for all tiers', () => {
    expect(
      validateTierConfiguration(
        [tier('t1', 1000, 5000, null, 0), tier('t2', 6000, null, null, 1)],
        1000,
        rewards,
      ),
    ).toBe('Purchase tiers must not leave a gap.')
    expect(
      validateTierConfiguration(
        [tier('t1', 1000, 10000, null, 0), tier('t2', 10000, 50000, null, 1)],
        1000,
        rewards,
      ),
    ).toBe('The highest active tier must not have an upper limit.')
    expect(
      validateTierConfiguration([tier('t1', 5000, null, null, 0)], 1000, rewards),
    ).toBe('The first active tier must start at 1,000.')
  })
})

describe('pool-tier purchase resolution on the client (display only)', () => {
  it('resolves the correct pool bracket regardless of the missing legacy gift', () => {
    const config = store([], [
      tier('t1', 1000, 10000, null, 0),
      tier('t2', 10000, 20000, null, 1),
    ])
    expect(getPurchaseTier(999, config)).toBeNull()
    expect(getPurchaseTier(1000, config)?.id).toBe('t1')
    expect(getPurchaseTier(19999, config)?.id).toBe('t2')
    expect(getPurchaseTier(20000, config)).toBeNull()
  })
})
