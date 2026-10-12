import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTier, validateTiers, assignSegments, buildClaimCode } from '../src/reward-engine.js'
import { nameError, phoneError, purchaseAmountError, normalizePhone, slugify, isValidSlug } from '../src/validate.js'
import { DEFAULT_TIERS, DEFAULT_REWARDS } from '../src/defaults.js'

// Build tiers/rewards that mirror the seeded defaults.
const rewards = DEFAULT_REWARDS.map((reward, index) => ({
  id: `reward_${index}`,
  name: reward.name,
  wheel_label: reward.wheel_label,
  active: true,
}))
const tiers = DEFAULT_TIERS.map((tier, index) => ({
  id: `tier_${index}`,
  min_amount: tier.min_amount,
  max_amount: tier.max_amount,
  reward_id: `reward_${tier.rewardIndex}`,
  target_segment: index,
  active: true,
}))

const MIN = 10000

test('every purchase boundary maps to exactly one tier', () => {
  const cases = [
    [10000, 0], [19999, 0], [20000, 1], [39999, 1], [40000, 2], [49999, 2],
    [50000, 3], [99999, 3], [100000, 4], [149999, 4], [150000, 5], [249999, 5],
    [250000, 6], [499999, 6], [500000, 7],
  ]
  for (const [amount, expectedIndex] of cases) {
    const tier = resolveTier(amount, tiers, MIN)
    assert.ok(tier, `expected a tier for ₹${amount}`)
    assert.equal(tier.id, `tier_${expectedIndex}`, `₹${amount} should map to tier ${expectedIndex}`)
  }
})

test('amounts below the minimum qualify for nothing', () => {
  assert.equal(resolveTier(9999, tiers, MIN), null)
  assert.equal(resolveTier(0, tiers, MIN), null)
  assert.equal(resolveTier(-100, tiers, MIN), null)
})

test('assignment is deterministic across repeated calls', () => {
  const first = resolveTier(75000, tiers, MIN)
  for (let i = 0; i < 25; i++) {
    assert.equal(resolveTier(75000, tiers, MIN).id, first.id)
  }
})

test('inactive tiers are ignored', () => {
  const disabled = tiers.map((tier) => (tier.id === 'tier_1' ? { ...tier, active: false } : tier))
  // Amounts that only tier 1 covered now match nothing rather than silently rolling over.
  assert.equal(resolveTier(25000, disabled, MIN), null)
  assert.equal(resolveTier(30000, disabled, MIN), null)
  // Amounts outside the disabled range still resolve normally.
  assert.equal(resolveTier(15000, disabled, MIN).id, 'tier_0')
  assert.equal(resolveTier(45000, disabled, MIN).id, 'tier_2')
})

test('tier validation accepts the seeded configuration', () => {
  const { errors } = validateTiers(tiers, rewards, MIN)
  assert.deepEqual(errors, [])
})

test('tier validation rejects overlaps', () => {
  const overlapping = [
    { ...tiers[0], min_amount: 10000, max_amount: 25000 },
    { ...tiers[1], min_amount: 20000, max_amount: 40000 },
  ]
  const { errors } = validateTiers(overlapping, rewards, MIN)
  assert.ok(errors.some((e) => /overlap/i.test(e)))
})

test('tier validation rejects gaps', () => {
  const gapped = [
    { ...tiers[0], min_amount: 10000, max_amount: 20000 },
    { ...tiers[1], min_amount: 25000, max_amount: 40000 },
  ]
  const { errors } = validateTiers(gapped, rewards, MIN)
  assert.ok(errors.some((e) => /gap/i.test(e)))
})

test('tier validation rejects a reward that is inactive or missing', () => {
  const inactiveRewards = rewards.map((r) => (r.id === 'reward_0' ? { ...r, active: false } : r))
  const inactive = validateTiers(tiers, inactiveRewards, MIN)
  assert.ok(inactive.errors.some((e) => /inactive/i.test(e)))

  const missingRewards = rewards.filter((r) => r.id !== 'reward_0')
  const missing = validateTiers(tiers, missingRewards, MIN)
  assert.ok(missing.errors.some((e) => /no longer exists/i.test(e)))
})

test('tier validation rejects a minimum above the qualifying threshold', () => {
  const high = [{ ...tiers[0], min_amount: 20000, max_amount: 40000 }]
  const { errors } = validateTiers(high, rewards, MIN)
  assert.ok(errors.some((e) => /minimum qualifying purchase/i.test(e)))
})

test('assignSegments keeps tiers in order and inside the wheel', () => {
  const assigned = assignSegments(tiers)
  assert.deepEqual(assigned.map((t) => t.target_segment), [0, 1, 2, 3, 4, 5, 6, 7])
  for (const tier of assigned) {
    assert.ok(tier.target_segment >= 0 && tier.target_segment < 8)
  }
})

test('claim codes are derived from the reward prefix and submission id', () => {
  const code = buildClaimCode('silv', '0c9f9c22-9103-4f6e-90e4-c3ba57638f92')
  assert.equal(code, 'SILV-638F92')
  assert.equal(buildClaimCode(null, 'abcdef12-3456-7890-abcd-ef1234567890'), 'GIFT-567890')
})

test('customer field validation matches the public form rules', () => {
  assert.equal(nameError('Anita Sharma'), null)
  assert.ok(nameError(''))
  assert.ok(nameError('A'))
  assert.ok(nameError('123'))

  assert.equal(phoneError('9876543210'), null)
  assert.equal(phoneError('+91 98765 43210'), null)
  assert.ok(phoneError('12345'))
  assert.equal(normalizePhone('+91 98765 43210'), '9876543210')

  assert.equal(purchaseAmountError(10000, MIN), null)
  assert.ok(purchaseAmountError(9999, MIN))
  assert.ok(purchaseAmountError('abc', MIN))
})

test('slug helpers produce safe url segments', () => {
  assert.equal(slugify('Shree Jewellers & Sons'), 'shree-jewellers-sons')
  assert.ok(isValidSlug('jewellers-demo'))
  assert.ok(!isValidSlug('a'))
  assert.ok(!isValidSlug('Bad Slug'))
})
