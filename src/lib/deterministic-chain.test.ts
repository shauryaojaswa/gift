import { describe, it, expect } from 'vitest'
import { buildSegments, evaluateReward, type RewardResult } from './reward-engine'
import { JOLLY_ENTERPRISES } from './stores'
import { computeTargetRotation, normalizeAngle, segmentCenterDegrees } from './wheel-math'

const cfg = JOLLY_ENTERPRISES

describe('deterministic reward -> wheel chain', () => {
  const segments = buildSegments(cfg)
  const segmentCount = segments.length

  it('wheel has exactly one segment per active tier', () => {
    expect(segmentCount).toBe(cfg.tiers.length)
    expect(segmentCount).toBe(8)
  })

  const cases = cfg.tiers.map(
    (t): [number, string, number] => [t.minAmount, t.rewardId, t.targetSegment],
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
      const seg = segments[targetSegment]
      expect(seg.index).toBe(targetSegment)
      expect(seg.rewardId).toBe(rewardId)

      const spin = computeTargetRotation(targetSegment, segmentCount)
      expect(
        normalizeAngle(
          spin.finalRotation + segmentCenterDegrees(targetSegment, segmentCount),
        ),
      ).toBeCloseTo(0)
    },
  )

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
