import type { GiftOption, Reward, RewardTier, StoreConfig, WheelSegment } from '../types'

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
 * The awardable gifts of one purchase bracket, in wheel order. A bracket with
 * an approved gift pool offers exactly those gifts; a bracket without a pool
 * falls back to its configured legacy reward (historical single-gift shops).
 * Returns [] when the bracket cannot award anything - callers must show the
 * designed "not configured" state and must not offer a spin.
 */
export function getAwardableOptions(tier: RewardTier, config: StoreConfig): GiftOption[] {
  if (tier.giftOptions && tier.giftOptions.length > 0) {
    return tier.giftOptions.map((option) => ({ ...option }))
  }
  const reward = tier.rewardId
    ? config.rewards.find((r) => r.id === tier.rewardId && r.active)
    : null
  if (!reward) return []
  return [
    {
      id: reward.id,
      name: reward.name,
      wheelLabel: reward.shortLabel || conciseLabel(reward.name),
      description: reward.description,
      voucherValue: reward.voucherValue ?? null,
    },
  ]
}

/**
 * Build the customer wheel from the bracket's REAL awardable gifts.
 *
 * Contract (v1.2.0 - do not weaken):
 *   - every slice label is a real prize of this shop's pool. Placeholder
 *     labels like 'GIFT' are never rendered;
 *   - slices cycle the pool to fill the wheel (8 slices, 6 when the pool has
 *     exactly 3 gifts so each gift shows twice);
 *   - when the backend's saved assignment is provided, the saved reward always
 *     wins: its slice shows the saved name (never a live config rename) and the
 *     wheel stops on it;
 *   - an empty pool yields no segments at all - the caller must not offer a
 *     spin when the backend cannot award a valid reward.
 */
export function buildWheelSegments(
  options: GiftOption[],
  assigned?: RewardResult | null,
  palette?: string[],
): WheelSegment[] {
  if (options.length === 0) return []
  const sliceCount = options.length >= 8 ? options.length : options.length === 3 ? 6 : 8
  const segments: WheelSegment[] = []
  for (let i = 0; i < sliceCount; i += 1) {
    const option = options[i % options.length]
    segments.push({
      index: i,
      rewardId: option.id,
      rewardName: option.wheelLabel || conciseLabel(option.name),
      rewardDescription: option.description,
      color: palette?.[i % palette.length] ?? HOUSE_WHEEL_PALETTE[i % HOUSE_WHEEL_PALETTE.length],
    })
  }
  if (assigned) {
    // The persisted claim is authoritative: its slice carries the saved reward
    // even if the shop's pool changed after the award.
    let index = segments.findIndex((s) => s.rewardId === assigned.reward.id)
    if (index === -1) index = 0
    segments[index] = {
      ...segments[index],
      rewardId: assigned.reward.id,
      rewardName: assigned.reward.shortLabel || conciseLabel(assigned.reward.name),
      rewardDescription: assigned.reward.description,
    }
  }
  return segments
}

/**
 * Every gift this shop can award, in purchase-bracket order: the full prize
 * pool the customer wheel advertises. A customer may win any gift on the
 * wheel - their purchase amount decides which one the engine assigns - so
 * each slice carries a different real gift and nothing placeholder.
 */
export function buildCatalogOptions(config: StoreConfig): GiftOption[] {
  const options: GiftOption[] = []
  const seen = new Set<string>()
  const add = (option: GiftOption) => {
    if (seen.has(option.id)) return
    seen.add(option.id)
    options.push(option)
  }
  const asOption = (reward: Reward): GiftOption => ({
    id: reward.id,
    name: reward.name,
    wheelLabel: reward.shortLabel || conciseLabel(reward.name),
    description: reward.description,
    voucherValue: reward.voucherValue ?? null,
  })
  const tiers = [...config.tiers].filter((tier) => tier.active).sort((a, b) => a.minAmount - b.minAmount)
  for (const tier of tiers) {
    for (const option of tier.giftOptions ?? []) add({ ...option })
    if (tier.rewardId) {
      const reward = config.rewards.find((r) => r.id === tier.rewardId && r.active)
      if (reward) add(asOption(reward))
    }
  }
  for (const reward of config.rewards) {
    if (reward.active) add(asOption(reward))
  }
  return options
}

/**
 * The wheel's gift list for a saved claim: the shop's whole catalog, plus the
 * saved reward itself when live config changed after the award (the persisted
 * claim is authoritative and must keep its own slice - never a stolen one).
 *
 * Gift-columns shops (eight owner-editable fields) use a strict mapping: the
 * wheel IS the eight published fields in order, so segment i always shows
 * field i. Blank fields are never published and therefore never render.
 */
export function buildWheelOptions(config: StoreConfig, assigned?: RewardResult | null): GiftOption[] {
  const published = config.giftColumns?.published ?? null
  const options: GiftOption[] = published
    ? published
        .filter((slot) => slot.name.trim() !== '')
        .map((slot) => ({
          id: slot.rewardId,
          name: slot.name,
          wheelLabel: conciseLabel(slot.name),
          description: '',
          voucherValue: null,
        }))
    : buildCatalogOptions(config)
  if (assigned && !options.some((option) => option.id === assigned.reward.id)) {
    options.push({
      id: assigned.reward.id,
      name: assigned.reward.name,
      wheelLabel: assigned.reward.shortLabel || conciseLabel(assigned.reward.name),
      description: assigned.reward.description,
      voucherValue: assigned.reward.voucherValue ?? null,
    })
  }
  return options
}

/** The slice the wheel must stop on: the one carrying the saved reward. */
export function landingSegmentIndex(
  segments: WheelSegment[],
  assigned?: RewardResult | null,
): number {
  if (segments.length === 0) return -1
  if (!assigned) return 0
  const index = segments.findIndex((s) => s.rewardId === assigned.reward.id)
  return index === -1 ? 0 : index
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

/** House wheel palette (used when no shop palette is supplied). */
export const HOUSE_WHEEL_PALETTE = [
  'hsl(350 48% 27%)',
  'hsl(34 31% 40%)',
  'hsl(350 28% 38%)',
  'hsl(28 35% 34%)',
  'hsl(345 36% 30%)',
  'hsl(38 30% 42%)',
  'hsl(18 31% 37%)',
  'hsl(350 42% 33%)',
]
