// Shared types for the multi-tenant SaaS surface.

export interface AuthUser {
  id: string
  email: string
  fullName: string | null
}

export interface Membership {
  store_id: string
  role: 'owner' | 'staff'
  slug: string
  name: string
  status: string
}

export interface SessionResponse {
  user: AuthUser | null
  memberships: Membership[]
  isPlatformAdmin: boolean
}

export interface OwnerReward {
  id: string
  name: string
  wheelLabel: string | null
  description: string
  voucherAmount: number | null
  claimCodePrefix: string | null
  validityText: string | null
  terms: string | null
  active: boolean
  sortOrder: number
}

export interface OwnerTier {
  id: string | null
  minAmount: number
  maxAmount: number | null
  rewardId: string
  targetSegment: number
  active: boolean
}

export interface OwnerStore {
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
  status: string
  rewards: OwnerReward[]
  tiers: OwnerTier[]
}

export interface SubscriptionSummary {
  planId: string
  planName: string
  priceInr: number
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended'
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  cancelAtPeriodEnd: boolean
  daysRemaining: number | null
  features: string[]
  limits: { maxStores: number; maxSubmissionsPerMonth: number | null; csvExport: boolean }
  usage: { submissionsThisMonth: number }
}

export interface StoreListItem {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  role: 'owner' | 'staff'
  status: string
  subscriptionStatus: string | null
  planId: string | null
}

export interface CustomerRecord {
  id: string
  customerName: string
  customerPhone: string
  purchaseAmount: number
  rewardLabel: string
  rewardDescription: string | null
  rewardVoucherAmount: number | null
  rewardValidityText: string | null
  claimCode: string | null
  collectionStatus: 'awaiting' | 'collected'
  collectedAt: string | null
  reviewCtaClicked: boolean
  createdAt: string
}

export interface CustomerListResult {
  items: CustomerRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface DashboardStats {
  totalEntries: number
  totalPurchaseValue: number
  totalCustomers: number
  awaitingCollection: number
  collected: number
  recentEntries: CustomerRecord[]
  rewardDistribution: Array<{ label: string; count: number }>
}

export interface Plan {
  id: string
  name: string
  price_inr: number
  billing_interval: string
  trial_days: number
  max_stores: number
  max_submissions_per_month: number | null
  csv_export: boolean
  features: string[]
  active: boolean
  sort_order: number
}

export interface PlatformMetrics {
  totalStores: number
  active: number
  trialing: number
  pastDue: number
  cancelled: number
  expired: number
  suspended: number
  mrrInr: number
  expiringTrials: number
  totalSubmissions: number
  recentActivity: Array<{
    id: string
    name: string
    slug: string
    created_at: string
    subscription_status: string | null
    plan_id: string | null
  }>
}

export interface PlatformStore {
  id: string
  slug: string
  name: string
  status: string
  created_at: string
  subscription_status: string | null
  plan_id: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  submission_count: number
}
