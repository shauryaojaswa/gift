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

export function validateTierConfiguration(
  tiers: RewardTier[],
  minSpinAmount: number,
  rewards: Reward[],
): string | null {
  const activeTiers = tiers.filter((tier) => tier.active).sort((a, b) => a.minAmount - b.minAmount)
  if (activeTiers.length === 0) return 'Add at least one active purchase tier.'
  if (activeTiers[0].minAmount !== minSpinAmount) {
    return `The first active tier must start at ${minSpinAmount.toLocaleString('en-IN')}.`
  }

  const segmentRewards = new Map<number, string>()
  for (let index = 0; index < activeTiers.length; index++) {
    const current = activeTiers[index]
    if (!Number.isInteger(current.minAmount) || current.minAmount <= 0) return 'Tier minimums must be positive whole rupee amounts.'
    if (current.maxAmount !== null && (!Number.isInteger(current.maxAmount) || current.maxAmount <= current.minAmount)) {
      return 'Each maximum must be greater than its minimum.'
    }
    if (!Number.isInteger(current.targetSegment) || current.targetSegment < 0 || current.targetSegment > 7) {
      return 'Choose a wheel segment from 1 to 8.'
    }
    if (current.rewardId != null) {
      if (!rewards.some((reward) => reward.id === current.rewardId && reward.active)) {
        return 'Every active tier must use an active gift.'
      }
      const mappedReward = segmentRewards.get(current.targetSegment)
      if (mappedReward && mappedReward !== current.rewardId) {
        return 'Different gifts cannot use the same wheel segment.'
      }
      segmentRewards.set(current.targetSegment, current.rewardId)
    }
    const next = activeTiers[index + 1]
    if (next && current.maxAmount !== next.minAmount) {
      return current.maxAmount === null || current.maxAmount > next.minAmount
        ? 'Purchase tiers must not overlap.'
        : 'Purchase tiers must not leave a gap.'
    }
    if (!next && current.maxAmount !== null) return 'The highest active tier must not have an upper limit.'
  }
  return null
}

export function evaluateReward(amount: number, config: StoreConfig): RewardResult | null {
  const tier = getPurchaseTier(amount, config)
  if (!tier) return null
  const reward = config.rewards.find((r) => r.id === tier.rewardId)
  if (!reward) return null
  const targetSegment = tier.targetSegment
  return { amount, tier, reward, targetSegment }
}

/**
 * Build the decorative wheel segments (display-only — the prize is always the
 * backend assignment). Legacy brackets map to their configured gift;
 * pool-based brackets (`rewardId: null`) get a neutral placeholder until the
 * backend assignment arrives, then the assigned segment is overridden with the
 * actual saved reward so the wheel always lands on what was awarded.
 */
export function buildSegments(config: StoreConfig, assigned?: RewardResult | null): WheelSegment[] {
  const bySegment = new Map<number, WheelSegment>()
  for (const tier of config.tiers) {
    if (!tier.active) continue
    const reward = tier.rewardId ? config.rewards.find((r) => r.id === tier.rewardId) : null
    const existing = bySegment.get(tier.targetSegment)
    if (existing) continue
    bySegment.set(
      tier.targetSegment,
      {
        index: tier.targetSegment,
        rewardId: reward?.id ?? '',
        rewardName: reward ? reward.shortLabel || conciseLabel(reward.name) : 'GIFT',
        rewardDescription: reward?.description ?? '',
        color: segmentColor(tier.targetSegment),
      },
    )
  }
  if (assigned) {
    bySegment.set(assigned.targetSegment, {
      index: assigned.targetSegment,
      rewardId: assigned.reward.id,
      rewardName: assigned.reward.shortLabel || conciseLabel(assigned.reward.name),
      rewardDescription: assigned.reward.description,
      color: segmentColor(assigned.targetSegment),
    })
  }
  return Array.from(bySegment.values()).sort((a, b) => a.index - b.index)
}

function conciseLabel(name: string): string {
  const labels = new Map([
    ['JEWELLERY CLEANING', 'CLEANING'],
    ['₹1,000 VOUCHER', '₹1K VOUCHER'],
    ['₹2,500 VOUCHER', '₹2.5K VOUCHER'],
    ['₹5,000 VOUCHER', '₹5K VOUCHER'],
  ])
  return labels.get(name) ?? name
}

const SEGMENT_COLORS = [
  'hsl(350 48% 27%)',
  'hsl(34 31% 40%)',
  'hsl(350 28% 38%)',
  'hsl(28 35% 34%)',
  'hsl(345 36% 30%)',
  'hsl(38 30% 42%)',
  'hsl(18 31% 37%)',
  'hsl(350 42% 33%)',
]

export function segmentColor(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]
}
