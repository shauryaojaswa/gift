export type FlowState =
  | 'WELCOME'
  | 'DETAILS'
  | 'REVIEW_INVITATION'
  | 'SPIN'
  | 'SPINNING'
  | 'REWARD'
  | 'THANK_YOU'
  | 'COMPLETE'

export type SpinStatus = 'idle' | 'spinning' | 'completed'

export interface CustomerInfo {
  fullName: string
  purchaseAmount: number
  phoneNumber: string
}

export interface ConsentState {
  dataConsent: boolean
  marketingConsent: boolean
}

export interface Reward {
  id: string
  name: string
  shortLabel?: string
  description: string
  voucherValue?: number | null
  claimCodePrefix: string | null
  validityText: string | null
  active: boolean
}

/**
 * One approved gift of a purchase bracket (from the shop's gift pool), with the
 * display fields the customer wheel needs. `id` is the reward id, so an option
 * can be matched against the backend's saved assignment.
 */
export interface GiftOption {
  id: string
  name: string
  wheelLabel: string
  description: string
  voucherValue: number | null
}

export interface RewardTier {
  id: string
  minAmount: number
  maxAmount: number | null
  /** Legacy single-gift bracket. Null for pool-based brackets (gift options). */
  rewardId: string | null
  targetSegment: number
  active: boolean
  /** Approved gift pool for this bracket (may be empty). */
  giftOptions?: GiftOption[]
}

export type StoreStatus = 'active' | 'suspended' | 'onboarding'

export interface StoreConfig {
  id: string
  slug: string
  name: string
  subtitle: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  googleReviewUrl: string | null
  campaignBadge: string | null
  minSpinAmount: number
  /** Lifecycle status — non-active shops show the inactive page and accept no entries. */
  status: StoreStatus
  rewards: Reward[]
  tiers: RewardTier[]
}

export interface WheelSegment {
  index: number
  rewardId: string
  rewardName: string
  rewardDescription: string
  color: string
}

export type BrandColor = {
  primary: string
  secondary: string
}
