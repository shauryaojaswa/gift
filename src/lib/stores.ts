import type { StoreConfig } from '../types'

export const JOLLY_ENTERPRISES_SLUG = 'jolly-enterprises'

export const JOLLY_ENTERPRISES: StoreConfig = {
  id: 'store_1',
  slug: JOLLY_ENTERPRISES_SLUG,
  name: 'JOLLY ENTERPRISES',
  subtitle: 'CUSTOMER REWARDS',
  logoUrl: '/assets/brand-logo.png',
  primaryColor: 'hsl(355 85% 45%)',
  secondaryColor: 'hsl(40 80% 50%)',
  googleReviewUrl: 'https://www.google.com/search?client=ms-android-samsung-gj-rev1&cs=0&hl=en-GB&sxsrf=APpeQnvltq_txMN187NzrlXBBgKiQwsbWw:1791370704978&si=APenkKm7iecQ4G6P-TsbSMFKIQtv3EFIqRAFw-i8uEbk55Z-_wK1r6R0JfuShgfoO-cQGi5ivdwczJYvolWPJe205B5ym_RXhaYgC3Zp5h1IJKQ6hyqY9Ttyvi50sjhkMuYKzdsATmG7&q=Shree+Jewellers+Reviews&biw=1280&bih=551&dpr=1.5#lrd=0x3bc11d000be053c1:0xebcd9fadee301ec,3,,,,',
  campaignBadge: 'SPIN & WIN',
  minSpinAmount: 10000,
  rewards: [
    {
      id: 'reward_1',
      name: 'JEWELLERY CLEANING',
      description: 'Professional deep cleaning and polishing of one piece of jewellery.',
      claimCodePrefix: 'CLEAN',
      validityText: 'Valid for 45 days from issue',
      active: true,
    },
    {
      id: 'reward_2',
      name: 'CARE KIT',
      description: 'A premium at-home jewellery care kit to keep your pieces sparkling.',
      claimCodePrefix: 'CARE',
      validityText: 'Valid for 60 days from issue',
      active: true,
    },
    {
      id: 'reward_3',
      name: '₹500 VOUCHER',
      description: 'A ₹500 making-charge voucher towards your next purchase.',
      claimCodePrefix: 'V500',
      validityText: 'Valid for 60 days from issue',
      active: true,
    },
    {
      id: 'reward_4',
      name: 'PREMIUM GIFT',
      description: 'A premium thank-you gift from our collection.',
      claimCodePrefix: 'GIFT',
      validityText: 'Valid for 90 days from issue',
      active: true,
    },
    {
      id: 'reward_5',
      name: '₹1,000 VOUCHER',
      description: 'A ₹1,000 voucher to savour your next celebration.',
      claimCodePrefix: 'V1000',
      validityText: 'Valid for 90 days from issue',
      active: true,
    },
    {
      id: 'reward_6',
      name: 'SILVER GIFT',
      description: 'An elegant sterling silver keepsake from our collection.',
      claimCodePrefix: 'SILV',
      validityText: 'Valid for 90 days from issue',
      active: true,
    },
    {
      id: 'reward_7',
      name: '₹2,500 VOUCHER',
      description: 'A ₹2,500 voucher towards making charges on your next luxury piece.',
      claimCodePrefix: 'V2500',
      validityText: 'Valid for 90 days from issue',
      active: true,
    },
    {
      id: 'reward_8',
      name: '₹5,000 VOUCHER',
      description: 'A ₹5,000 gold gift voucher honouring your valued loyalty.',
      claimCodePrefix: 'V5000',
      validityText: 'Valid for 90 days from issue',
      active: true,
    },
  ],
  tiers: [
    { id: 'tier_1', minAmount: 10000, maxAmount: 20000, rewardId: 'reward_1', targetSegment: 0, active: true },
    { id: 'tier_2', minAmount: 20000, maxAmount: 40000, rewardId: 'reward_2', targetSegment: 1, active: true },
    { id: 'tier_3', minAmount: 40000, maxAmount: 50000, rewardId: 'reward_3', targetSegment: 2, active: true },
    { id: 'tier_4', minAmount: 50000, maxAmount: 100000, rewardId: 'reward_4', targetSegment: 3, active: true },
    { id: 'tier_5', minAmount: 100000, maxAmount: 150000, rewardId: 'reward_5', targetSegment: 4, active: true },
    { id: 'tier_6', minAmount: 150000, maxAmount: 250000, rewardId: 'reward_6', targetSegment: 5, active: true },
    { id: 'tier_7', minAmount: 250000, maxAmount: 500000, rewardId: 'reward_7', targetSegment: 6, active: true },
    { id: 'tier_8', minAmount: 500000, maxAmount: null, rewardId: 'reward_8', targetSegment: 7, active: true },
  ],
}

export const ALL_STORES: StoreConfig[] = [JOLLY_ENTERPRISES]
