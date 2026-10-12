// Seed values for a brand-new store. These are editable defaults, not fixed rules.

export const DEFAULT_REWARDS = [
  {
    name: 'Jewellery Cleaning & Polishing',
    wheel_label: 'CLEANING',
    description: 'Professional deep cleaning and polishing of one piece of jewellery.',
    voucher_amount: null,
    claim_code_prefix: 'CLEAN',
    validity_text: 'Valid for 45 days from issue',
  },
  {
    name: 'Premium Jewellery Care Kit',
    wheel_label: 'CARE KIT',
    description: 'A premium at-home jewellery care kit to keep your pieces sparkling.',
    voucher_amount: null,
    claim_code_prefix: 'CARE',
    validity_text: 'Valid for 60 days from issue',
  },
  {
    name: '₹500 Future Purchase Voucher',
    wheel_label: '₹500 VOUCHER',
    description: 'A ₹500 voucher towards your next purchase.',
    voucher_amount: 500,
    claim_code_prefix: 'V500',
    validity_text: 'Valid for 60 days from issue',
  },
  {
    name: 'Premium Gift',
    wheel_label: 'PREMIUM GIFT',
    description: 'A premium thank-you gift from our collection.',
    voucher_amount: null,
    claim_code_prefix: 'GIFT',
    validity_text: 'Valid for 90 days from issue',
  },
  {
    name: '₹1,000 Making-Charge Voucher',
    wheel_label: '₹1K VOUCHER',
    description: 'A ₹1,000 voucher towards making charges on your next piece.',
    voucher_amount: 1000,
    claim_code_prefix: 'V1000',
    validity_text: 'Valid for 90 days from issue',
  },
  {
    name: 'Premium Silver Gift',
    wheel_label: 'SILVER GIFT',
    description: 'An elegant sterling silver keepsake from our collection.',
    voucher_amount: null,
    claim_code_prefix: 'SILV',
    validity_text: 'Valid for 90 days from issue',
  },
  {
    name: '₹2,500 Making-Charge Voucher',
    wheel_label: '₹2.5K VOUCHER',
    description: 'A ₹2,500 voucher towards making charges on your next luxury piece.',
    voucher_amount: 2500,
    claim_code_prefix: 'V2500',
    validity_text: 'Valid for 90 days from issue',
  },
  {
    name: '₹5,000 Store Voucher',
    wheel_label: '₹5K VOUCHER',
    description: 'A ₹5,000 store voucher or premium gift honouring your valued loyalty.',
    voucher_amount: 5000,
    claim_code_prefix: 'V5000',
    validity_text: 'Valid for 90 days from issue',
  },
]

// max_amount is exclusive: ₹10,000–₹19,999 is stored as min 10000, max 20000.
export const DEFAULT_TIERS = [
  { min_amount: 10000, max_amount: 20000, rewardIndex: 0 },
  { min_amount: 20000, max_amount: 40000, rewardIndex: 1 },
  { min_amount: 40000, max_amount: 50000, rewardIndex: 2 },
  { min_amount: 50000, max_amount: 100000, rewardIndex: 3 },
  { min_amount: 100000, max_amount: 150000, rewardIndex: 4 },
  { min_amount: 150000, max_amount: 250000, rewardIndex: 5 },
  { min_amount: 250000, max_amount: 500000, rewardIndex: 6 },
  { min_amount: 500000, max_amount: null, rewardIndex: 7 },
]

/**
 * Insert the default rewards and tiers for a store inside an open transaction.
 * Returns the created rewards in order.
 */
export async function insertDefaultConfig(client, storeId) {
  const rewards = []
  for (let i = 0; i < DEFAULT_REWARDS.length; i++) {
    const reward = DEFAULT_REWARDS[i]
    const { rows } = await client.query(
      `insert into rewards (store_id, name, wheel_label, description, voucher_amount, claim_code_prefix, validity_text, active, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8) returning *`,
      [storeId, reward.name, reward.wheel_label, reward.description, reward.voucher_amount,
       reward.claim_code_prefix, reward.validity_text, i],
    )
    rewards.push(rows[0])
  }
  for (let i = 0; i < DEFAULT_TIERS.length; i++) {
    const tier = DEFAULT_TIERS[i]
    await client.query(
      `insert into reward_tiers (store_id, min_amount, max_amount, reward_id, target_segment, active)
       values ($1,$2,$3,$4,$5,true)`,
      [storeId, tier.min_amount, tier.max_amount, rewards[tier.rewardIndex].id, i],
    )
  }
  return rewards
}

export const DEFAULT_STORE = {
  subtitle: 'CUSTOMER REWARDS',
  logo_url: '/assets/brand-logo.png',
  primary_color: 'hsl(350 48% 27%)',
  secondary_color: 'hsl(39 34% 59%)',
  campaign_badge: 'SPIN & WIN',
  min_spin_amount: 10000,
}
