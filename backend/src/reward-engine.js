// Deterministic reward assignment. The reward is derived from the purchase
// amount and the store's active tiers. Math.random() is never used.

export class TierConfigError extends Error {}

/** Resolve the active tier that contains `amount`, or null when none matches. */
export function resolveTier(amount, tiers, minSpinAmount = 0) {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (amount < minSpinAmount) return null
  const active = tiers
    .filter((tier) => tier.active)
    .sort((a, b) => a.min_amount - b.min_amount)
  for (const tier of active) {
    const aboveMin = amount >= tier.min_amount
    const belowMax = tier.max_amount === null || amount < tier.max_amount
    if (aboveMin && belowMax) return tier
  }
  return null
}

/**
 * Validate a store's tier configuration.
 * Returns { errors: string[], warnings: string[] }.
 */
export function validateTiers(tiers, rewards, minSpinAmount = 0) {
  const errors = []
  const warnings = []
  const active = tiers.filter((t) => t.active).sort((a, b) => a.min_amount - b.min_amount)

  if (active.length === 0) {
    errors.push('At least one active purchase tier is required.')
    return { errors, warnings }
  }

  const rewardById = new Map(rewards.map((r) => [r.id, r]))

  for (const tier of active) {
    if (tier.max_amount !== null && tier.min_amount >= tier.max_amount) {
      errors.push(`Tier starting at ₹${tier.min_amount.toLocaleString('en-IN')} has a maximum that is not greater than its minimum.`)
    }
    const reward = rewardById.get(tier.reward_id)
    if (!reward) {
      errors.push(`Tier starting at ₹${tier.min_amount.toLocaleString('en-IN')} points to a reward that no longer exists.`)
    } else if (!reward.active) {
      errors.push(`Tier starting at ₹${tier.min_amount.toLocaleString('en-IN')} points to an inactive reward.`)
    }
  }

  if (active.length > 0 && active[0].min_amount > minSpinAmount) {
    errors.push(`The lowest tier starts at ₹${active[0].min_amount.toLocaleString('en-IN')}, above the minimum qualifying purchase of ₹${minSpinAmount.toLocaleString('en-IN')}.`)
  }

  for (let i = 1; i < active.length; i++) {
    const prev = active[i - 1]
    const current = active[i]
    if (prev.max_amount === null) {
      errors.push(`Tier starting at ₹${prev.min_amount.toLocaleString('en-IN')} is open-ended but is followed by another tier.`)
      continue
    }
    if (current.min_amount < prev.max_amount) {
      errors.push(`Tiers overlap between ₹${current.min_amount.toLocaleString('en-IN')} and ₹${prev.max_amount.toLocaleString('en-IN')}.`)
    } else if (current.min_amount > prev.max_amount) {
      errors.push(`There is a gap in qualifying amounts between ₹${prev.max_amount.toLocaleString('en-IN')} and ₹${current.min_amount.toLocaleString('en-IN')}.`)
    }
  }

  const last = active[active.length - 1]
  if (last && last.max_amount !== null) {
    warnings.push('The highest tier has a maximum amount; purchases above it will not qualify.')
  }

  return { errors, warnings }
}

const SEGMENT_COUNT = 8

/** Assign a wheel segment so no two tiers share one, in tier order. */
export function assignSegments(tiers) {
  const sorted = [...tiers].sort((a, b) => a.min_amount - b.min_amount)
  return sorted.map((tier, index) => ({ ...tier, target_segment: index % SEGMENT_COUNT }))
}

export function buildClaimCode(prefix, submissionId) {
  const cleanPrefix = (prefix ?? 'GIFT').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'GIFT'
  const suffix = String(submissionId).replace(/-/g, '').slice(-6).toUpperCase()
  return `${cleanPrefix}-${suffix}`
}
