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

/**
 * The owner's eight editable gift fields, mapped one-to-one onto the eight
 * wheel segments. `draft` is the owner's working copy (partial saves allowed);
 * `published` is the live wheel and only changes in one atomic step after all
 * eight fields are filled. Null `published` = never published (customers see
 * the designed "REWARDS ARE BEING SET UP" state - no prizes exist yet).
 */
export interface GiftColumnsConfig {
  /** Exactly 8 entries; blank string = field not configured yet. */
  draft: string[]
  /** The live wheel's eight gifts, in segment order (segment i = field i). */
  published: Array<{ name: string; rewardId: string }> | null
  publishedAt: string | null
}

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
  /** Platform control: whether the owner may edit the Google review link. Absent = allowed. */
  reviewLinkOwnerEditable?: boolean
  /** Lifecycle status — non-active shops show the inactive page and accept no entries. */
  status: StoreStatus
  /**
   * Present only for gift-columns shops (eight owner-editable gift fields).
   * Absent/null = the shop uses the existing rewards/tiers editors instead.
   */
  giftColumns?: GiftColumnsConfig | null
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
