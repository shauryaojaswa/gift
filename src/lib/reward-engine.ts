import type { Reward, RewardTier, StoreConfig, WheelSegment } from '../types'

export function getPurchaseTier(
  amount: number,
  config: StoreConfig,
): RewardTier | null {
  const sorted = [...config.tiers].sort((a, b) => a.minAmount - b.minAmount)
  for (const tier of sorted) {
    if (!tier.active) continue
    if (amount < config.minSpinAmount) return null
    if (amount >= tier.minAmount && (tier.maxAmount === null || amount < tier.maxAmount)) {
      return tier
    }
  }
  return null
}

export function getRewardForAmount(amount: number, config: StoreConfig): Reward | null {
  const tier = getPurchaseTier(amount, config)
  if (!tier) return null
  return config.rewards.find((r) => r.id === tier.rewardId) ?? null
}

export function getWheelTargetSegment(rewardId: string, config: StoreConfig): number {
  const tier = config.tiers.find((t) => t.active && t.rewardId === rewardId)
  if (!tier) {
    const fallback = config.tiers.find((t) => t.targetSegment === 0)
    return fallback?.targetSegment ?? 0
  }
  return tier.targetSegment
}

export interface RewardResult {
  amount: number
  tier: RewardTier
  reward: Reward
  targetSegment: number
}

export function evaluateReward(amount: number, config: StoreConfig): RewardResult | null {
  const tier = getPurchaseTier(amount, config)
  if (!tier) return null
  const reward = config.rewards.find((r) => r.id === tier.rewardId)
  if (!reward) return null
  const targetSegment = tier.targetSegment
  return { amount, tier, reward, targetSegment }
}

export function buildSegments(config: StoreConfig): WheelSegment[] {
  const bySegment = new Map<number, WheelSegment>()
  for (const tier of config.tiers) {
    if (!tier.active) continue
    const reward = config.rewards.find((r) => r.id === tier.rewardId)
    if (!reward) continue
    const existing = bySegment.get(tier.targetSegment)
    if (existing) continue
    bySegment.set(
      tier.targetSegment,
      {
        index: tier.targetSegment,
        rewardId: reward.id,
        rewardName: reward.name,
        rewardDescription: reward.description,
        color: segmentColor(tier.targetSegment),
      },
    )
  }
  return Array.from(bySegment.values()).sort((a, b) => a.index - b.index)
}

const SEGMENT_COLORS = [
  'hsl(40 80% 56%)',
  'hsl(355 82% 48%)',
  'hsl(48 60% 88%)',
  'hsl(35 75% 48%)',
  'hsl(345 80% 40%)',
  'hsl(50 55% 90%)',
  'hsl(45 70% 52%)',
  'hsl(350 75% 45%)',
]

export function segmentColor(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]
}
