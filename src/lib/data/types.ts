import type { GiftColumnsConfig, Reward, RewardTier, StoreConfig } from '../../types'

export interface SubmissionRecord {
  id: string
  storeId: string
  storeName: string
  customerName: string
  customerPhone: string
  purchaseAmount: number
  rewardId: string
  rewardLabel: string
  rewardDescription: string
  rewardShortLabel: string | null
  rewardClaimCodePrefix: string | null
  rewardValidityText: string | null
  rewardVoucherValue: number | null
  tierId: string
  tierMinAmount: number
  tierMaxAmount: number | null
  targetSegment: number
  couponCode: string | null
  collectionStatus: 'awaiting' | 'collected'
  collectedAt: string | null
  collectedBy: string | null
  reviewCtaShown: boolean
  reviewCtaClicked: boolean
  createdAt: string
  /** Optional invoice/bill details provided by the customer; null/absent when not provided. */
  invoiceDetails?: string | null
}

export interface AdminStats {
  totalSubmissions: number
  totalCustomers: number
  totalPurchaseValue: number
  awaitingCollection: number
  collectedGifts: number
  rewardDistribution: Record<string, number>
  reviewCtaClicks: number
}

export interface ListOptions {
  page: number
  pageSize: number
  search: string
  dateFrom?: string
  dateTo?: string
  minPurchase?: number
  maxPurchase?: number
  rewardId?: string
  collectionStatus?: 'awaiting' | 'collected'
}

export interface ListResult {
  items: SubmissionRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface CreateSubmissionInput {
  storeSlug: string
  requestId: string
  customerName: string
  customerPhone: string
  purchaseAmount: number
  reviewCtaShown: boolean
  reviewCtaClicked: boolean
  /** Optional invoice/bill details; omit or null when the customer provides none. */
  invoiceDetails?: string | null
}

export interface RewardAssignment {
  id: string
  reward: Reward
  tier: RewardTier
  claimCode: string
}

export interface AdminSession {
  id: string
  email: string
}

export type StorePatch = Partial<Pick<
  StoreConfig,
  'name' | 'subtitle' | 'logoUrl' | 'primaryColor' | 'secondaryColor' | 'googleReviewUrl' | 'campaignBadge' | 'minSpinAmount'
>> & { storeId?: string; rewards?: Reward[]; tiers?: RewardTier[] }

export interface DataProvider {
  getStoreConfig(slug: string): Promise<StoreConfig | null>
  getAdminStoreConfig(): Promise<StoreConfig | null>
  createSubmission(input: CreateSubmissionInput): Promise<RewardAssignment>
  signInAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }>
  signOut(): Promise<void>
  getSession(): Promise<AdminSession | null>
  listSubmissions(opts: ListOptions): Promise<ListResult>
  markSubmissionCollected(id: string): Promise<void>
  getStats(): Promise<AdminStats>
  upsertReward(reward: Reward): Promise<Reward>
  deleteReward(id: string): Promise<void>
  upsertTier(tier: RewardTier): Promise<RewardTier>
  deleteTier(id: string): Promise<void>
  saveTierConfiguration(tiers: RewardTier[]): Promise<void>
  updateStore(patch: StorePatch): Promise<StoreConfig>
  uploadStoreLogo(file: File): Promise<string>
  /**
   * Save the eight gift fields. `publish: false` stores the draft only (partial
   * saves allowed); `publish: true` requires all 8 fields filled and replaces
   * the live wheel atomically. Returns the persisted config.
   */
  saveGiftColumns(draft: string[], publish: boolean): Promise<GiftColumnsConfig>
}

export type DataProviderKind = 'local' | 'supabase'
