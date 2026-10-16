import { describe, it, expect } from 'vitest'
import {
  buildWheelSegments,
  evaluateReward,
  getAwardableOptions,
  landingSegmentIndex,
  type RewardResult,
} from './reward-engine'
import { JOLLY_ENTERPRISES } from './stores'
import { computeTargetRotation, normalizeAngle, segmentCenterDegrees } from './wheel-math'
import type { GiftOption } from '../types'

const cfg = JOLLY_ENTERPRISES

describe('deterministic reward -> wheel chain', () => {
  const cases = cfg.tiers.map(
    (t): [number, string, number] => [t.minAmount, t.rewardId as string, t.targetSegment],
  )

  it.each(cases)(
    'purchase ruppes %i -> reward %s at wheel segment %i (predetermined, not random)',
    (amount, rewardId, targetSegment) => {
      const result = evaluateReward(amount, cfg)
      expect(result).not.toBeNull()
      const r = result as RewardResult
      expect(r.reward.id).toBe(rewardId)
      expect(r.tier.targetSegment).toBe(targetSegment)
      expect(r.targetSegment).toBe(targetSegment)

      // The wheel is built from the bracket's real awardable gifts only.
      const options = getAwardableOptions(r.tier, cfg)
      expect(options.length).toBeGreaterThan(0)
      expect(options.map((o) => o.id)).toContain(rewardId)
      const segments = buildWheelSegments(options, r)
      expect(segments.length).toBeGreaterThan(0)

      // Every slice shows a real prize; placeholder labels are forbidden.
      const realLabels = new Set(options.map((o) => o.wheelLabel || o.name))
      for (const seg of segments) {
        expect(seg.rewardName).not.toBe('GIFT')
        expect(realLabels.has(seg.rewardName)).toBe(true)
      }

      // The wheel stops exactly on the slice carrying the saved reward.
      const landing = landingSegmentIndex(segments, r)
      expect(segments[landing].rewardId).toBe(rewardId)
      const spin = computeTargetRotation(landing, segments.length)
      expect(
        normalizeAngle(spin.finalRotation + segmentCenterDegrees(landing, segments.length)),
      ).toBeCloseTo(0)
    },
  )

  it('pool wheel stops exactly on the saved gift slice (3-gift pool)', () => {
    const pool: GiftOption[] = [
      { id: 'g1', name: 'Gold Coin', wheelLabel: 'GOLD COIN', description: '', voucherValue: null },
      { id: 'g2', name: 'Silver Coin', wheelLabel: 'SILVER COIN', description: '', voucherValue: null },
      { id: 'g3', name: 'Gift Hamper', wheelLabel: 'GIFT HAMPER', description: '', voucherValue: null },
    ]
    const assigned: RewardResult = {
      amount: 15000,
      tier: { ...cfg.tiers[0], id: 'pool-tier', rewardId: null, giftOptions: pool },
      reward: {
        id: 'g3',
        name: 'Gift Hamper',
        shortLabel: 'GIFT HAMPER',
        description: '',
        voucherValue: null,
        claimCodePrefix: 'GIFT',
        validityText: null,
        active: true,
      },
      targetSegment: 2,
    }
    const segments = buildWheelSegments(pool, assigned)
    const landing = landingSegmentIndex(segments, assigned)
    expect(segments[landing].rewardName).toBe('GIFT HAMPER')
    const spin = computeTargetRotation(landing, segments.length)
    expect(
      normalizeAngle(spin.finalRotation + segmentCenterDegrees(landing, segments.length)),
    ).toBeCloseTo(0)
  })

  it('spec example: 125000 lands on reward_5 / segment 4', () => {
    const result = evaluateReward(125000, cfg)
    expect(result?.reward.id).toBe('reward_5')
    expect(result?.targetSegment).toBe(4)
  })

  it('two different amounts produce two different, predetermined rewards', () => {
    const a = evaluateReward(12000, cfg)
    const b = evaluateReward(600000, cfg)
    expect(a?.reward.id).not.toBe(b?.reward.id)
    expect(a?.targetSegment).not.toBe(b?.targetSegment)
  })

  it('same amount always resolves to the same segment (deterministic)', () => {
    const a = evaluateReward(75000, cfg)
    const b = evaluateReward(75000, cfg)
    expect(a).toEqual(b)
  })
})
