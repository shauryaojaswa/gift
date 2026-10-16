import { describe, expect, it } from 'vitest'
import {
  buildWheelSegments,
  getAwardableOptions,
  landingSegmentIndex,
  validateTierConfiguration,
  getPurchaseTier,
  type RewardResult,
} from './reward-engine'
import type { GiftOption, Reward, RewardTier, StoreConfig } from '../types'

/**
 * Pool-bracket (Option B) behaviour of the client-side presentation layer.
 * Prize selection is server-side and tested in scripts/staging-verify.mjs;
 * these tests pin the v1.2.0 wheel rendering contract:
 *   - slice labels are ALWAYS real prizes from the shop's approved pool
 *     (placeholder labels like 'GIFT' are forbidden),
 *   - the backend's saved reward always wins and is where the wheel stops,
 *   - brackets without a usable pool produce no wheel at all.
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

const option = (id: string, name: string, wheelLabel: string): GiftOption => ({
  id,
  name,
  wheelLabel,
  description: `${name} description`,
  voucherValue: null,
})

const tier = (
  id: string,
  min: number,
  max: number | null,
  rewardId: string | null,
  segment: number,
  giftOptions?: GiftOption[],
): RewardTier => ({
  id,
  minAmount: min,
  maxAmount: max,
  rewardId,
  targetSegment: segment,
  active: true,
  giftOptions,
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
  status: 'active',
  rewards,
  tiers,
})

const pool = [
  option('g1', 'Gold Coin', 'GOLD COIN'),
  option('g2', 'Silver Coin', 'SILVER COIN'),
  option('g3', 'Gift Hamper', 'GIFT HAMPER'),
  option('g4', 'Care Voucher', 'CARE VOUCHER'),
]

describe('getAwardableOptions', () => {
  it('offers exactly the approved pool for a pool bracket', () => {
    const config = store([], [tier('t1', 1000, 10000, null, 0, pool)])
    expect(getAwardableOptions(config.tiers[0], config).map((o) => o.id)).toEqual([
      'g1',
      'g2',
      'g3',
      'g4',
    ])
  })

  it('falls back to the configured legacy reward when the bracket has no pool', () => {
    const config = store([reward('r1', 'Legacy Gift')], [tier('t1', 1000, null, 'r1', 0, [])])
    const options = getAwardableOptions(config.tiers[0], config)
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'r1', name: 'Legacy Gift', wheelLabel: 'Legacy Gift' })
  })

  it('prefers the pool over the legacy reward when both exist', () => {
    const config = store([reward('r1', 'Legacy Gift')], [tier('t1', 1000, null, 'r1', 0, pool)])
    expect(getAwardableOptions(config.tiers[0], config).map((o) => o.id)).not.toContain('r1')
  })

  it('returns [] for a bracket that cannot award anything', () => {
    const config = store([], [tier('t1', 1000, null, null, 0, [])])
    expect(getAwardableOptions(config.tiers[0], config)).toEqual([])
  })

  it('ignores inactive legacy rewards', () => {
    const config = store(
      [{ ...reward('r1', 'Legacy Gift'), active: false }],
      [tier('t1', 1000, null, 'r1', 0, [])],
    )
    expect(getAwardableOptions(config.tiers[0], config)).toEqual([])
  })
})

describe('buildWheelSegments with pool brackets', () => {
  it('renders every slice with a real prize label from the pool (never a placeholder)', () => {
    const segments = buildWheelSegments(pool)
    expect(segments).toHaveLength(8)
    const labels = new Set(segments.map((s) => s.rewardName))
    expect(labels).toEqual(new Set(['GOLD COIN', 'SILVER COIN', 'GIFT HAMPER', 'CARE VOUCHER']))
    expect(segments.map((s) => s.rewardName)).not.toContain('GIFT')
  })

  it('cycles the pool evenly so no gift is over-represented', () => {
    const segments = buildWheelSegments(pool)
    const counts = new Map<string, number>()
    for (const s of segments) counts.set(s.rewardId, (counts.get(s.rewardId) ?? 0) + 1)
    expect([...counts.values()]).toEqual([2, 2, 2, 2])
  })

  it('uses 6 slices for a 3-gift pool so each gift shows twice', () => {
    const segments = buildWheelSegments(pool.slice(0, 3))
    expect(segments).toHaveLength(6)
    const counts = new Map<string, number>()
    for (const s of segments) counts.set(s.rewardId, (counts.get(s.rewardId) ?? 0) + 1)
    expect([...counts.values()]).toEqual([2, 2, 2])
  })

  it('overrides the assigned slice with the saved reward so the wheel lands on it', () => {
    const assigned: RewardResult = {
      amount: 15000,
      tier: tier('t1', 10000, 20000, null, 1, pool),
      reward: reward('g2', 'Silver Coin'),
      targetSegment: 1,
    }
    const segments = buildWheelSegments(pool, assigned)
    const landing = landingSegmentIndex(segments, assigned)
    expect(segments[landing].rewardName).toBe('Silver Coin')
    expect(segments[landing].rewardId).toBe('g2')
    expect(landing).toBe(1)
    // other slices still show real pool prizes
    expect(segments[0].rewardId).toBe('g1')
  })

  it('never lets live configuration override a saved reward', () => {
    const assigned: RewardResult = {
      amount: 15000,
      tier: tier('t1', 10000, 20000, null, 1),
      reward: { ...reward('pool-pick', 'Assigned Name'), shortLabel: 'ASSIGNED NAME' },
      targetSegment: 1,
    }
    // pool changed after the award: no option matches the saved reward id
    const segments = buildWheelSegments([option('g9', 'New Gift', 'NEW GIFT')], assigned)
    const landing = landingSegmentIndex(segments, assigned)
    expect(landing).toBe(0)
    expect(segments[landing].rewardId).toBe('pool-pick')
    expect(segments[landing].rewardName).toBe('ASSIGNED NAME')
  })

  it('uses the saved short wheel label when the assignment provides one', () => {
    const assigned: RewardResult = {
      amount: 15000,
      tier: tier('t1', 10000, 20000, null, 1, pool),
      reward: { ...reward('g2', 'Silver Coin Gift Box'), shortLabel: 'SILVER COIN' },
      targetSegment: 1,
    }
    const segments = buildWheelSegments(pool, assigned)
    expect(segments[landingSegmentIndex(segments, assigned)].rewardName).toBe('SILVER COIN')
  })

  it('produces no segments for an empty pool (callers must not offer a spin)', () => {
    expect(buildWheelSegments([])).toEqual([])
    expect(landingSegmentIndex([], null)).toBe(-1)
  })

  it('fills single-gift brackets with the real gift on every slice', () => {
    const options = [option('g1', 'Jewellery Cleaning', 'CLEANING')]
    const segments = buildWheelSegments(options)
    expect(segments).toHaveLength(8)
    expect(new Set(segments.map((s) => s.rewardName))).toEqual(new Set(['CLEANING']))
  })

  it('applies the shop palette to slice colors', () => {
    const palette = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888']
    const segments = buildWheelSegments(pool, null, palette)
    expect(segments[0].color).toBe('#111111')
    expect(segments[1].color).toBe('#222222')
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
    const tiers = [tier('t1', 1000, 10000, 'missing', 0), tier('t2', 10000, null, 'r1', 1)]
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
    expect(validateTierConfiguration([tier('t1', 5000, null, null, 0)], 1000, rewards)).toBe(
      'The first active tier must start at 1,000.',
    )
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
