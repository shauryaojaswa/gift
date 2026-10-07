import type { Reward, RewardTier, StoreConfig } from '../../types'

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
  couponCode: string | null
  reviewCtaShown: boolean
  reviewCtaClicked: boolean
  createdAt: string
}

export interface AdminStats {
  totalSubmissions: number
  totalCustomers: number
  averagePurchaseAmount: number
  rewardDistribution: Record<string, number>
  reviewCtaClicks: number
}

export interface ListOptions {
  page: number
  pageSize: number
  search: string
}

export interface ListResult {
  items: SubmissionRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface CreateSubmissionInput {
  storeId: string
  storeName: string
  customerName: string
  customerPhone: string
  purchaseAmount: number
  reward: Reward
  tier: RewardTier
  reviewCtaShown: boolean
  reviewCtaClicked: boolean
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
  createSubmission(input: CreateSubmissionInput): Promise<{ id: string }>
  signInAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }>
  signOut(): Promise<void>
  getSession(): Promise<AdminSession | null>
  listSubmissions(opts: ListOptions): Promise<ListResult>
  getStats(): Promise<AdminStats>
  upsertReward(reward: Reward): Promise<Reward>
  deleteReward(id: string): Promise<void>
  upsertTier(tier: RewardTier): Promise<RewardTier>
  deleteTier(id: string): Promise<void>
  updateStore(patch: StorePatch): Promise<StoreConfig>
}

export type DataProviderKind = 'local' | 'supabase'
