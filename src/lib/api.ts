import type {
  CustomerListResult,
  DashboardStats,
  Membership,
  OwnerReward,
  OwnerStore,
  OwnerTier,
  Plan,
  PlatformMetrics,
  PlatformStore,
  SessionResponse,
  StoreListItem,
  SubscriptionSummary,
} from '@/types/saas'
import type { StoreConfig } from '@/types'

export class ApiError extends Error {
  status: number
  detail?: string
  errors?: string[]
  constructor(message: string, status: number, detail?: string, errors?: string[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.errors = errors
  }
}

async function request<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const { method = 'GET', json } = init
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new ApiError(data?.error ?? 'Request failed', response.status, data?.detail, data?.errors)
  }
  return data as T
}

export interface CustomerFilters {
  search?: string
  status?: string
  reward?: string
  from?: string
  to?: string
  minAmount?: number
  maxAmount?: number
  page?: number
  pageSize?: number
}

function queryString(filters: CustomerFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  // --- auth -----------------------------------------------------------------
  register: (body: { email: string; password: string; fullName?: string }) =>
    request<SessionResponse>('/auth/register', { method: 'POST', json: body }),
  login: (body: { email: string; password: string }) =>
    request<SessionResponse>('/auth/login', { method: 'POST', json: body }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<SessionResponse>('/auth/me'),

  // --- public campaign ------------------------------------------------------
  getPublicPlans: () => request<{ plans: Plan[] }>('/public/plans'),
  getPublicStore: (slug: string) => request<StoreConfig & { campaignActive: boolean; campaignMessage: string | null }>(`/public/stores/${slug}`),
  createPublicSubmission: (
    slug: string,
    body: { customerName: string; phone: string; purchaseAmount: number; reviewCtaShown?: boolean; reviewCtaClicked?: boolean },
  ) =>
    request<{
      submissionId: string
      claimCode: string
      purchaseAmount: number
      reward: { id: string; name: string; wheelLabel: string | null; description: string | null; voucherAmount: number | null; validityText: string | null }
      targetSegment: number
    }>(`/public/stores/${slug}/submissions`, { method: 'POST', json: body }),

  // --- owner ----------------------------------------------------------------
  listStores: () => request<{ stores: StoreListItem[] }>('/owner/stores'),
  createStore: (body: { name: string; slug?: string; logoUrl?: string; primaryColor?: string; secondaryColor?: string; googleReviewUrl?: string }) =>
    request<OwnerStore>('/owner/stores', { method: 'POST', json: body }),
  getStore: (storeId: string) => request<{ store: OwnerStore; subscription: SubscriptionSummary | null }>(`/owner/stores/${storeId}`),
  updateStore: (storeId: string, patch: Partial<Record<string, unknown>>) =>
    request<OwnerStore>(`/owner/stores/${storeId}`, { method: 'PATCH', json: patch }),

  createReward: (storeId: string, body: Partial<OwnerReward>) =>
    request<OwnerReward>(`/owner/stores/${storeId}/rewards`, { method: 'POST', json: body }),
  updateReward: (storeId: string, rewardId: string, patch: Partial<OwnerReward>) =>
    request<OwnerReward>(`/owner/stores/${storeId}/rewards/${rewardId}`, { method: 'PATCH', json: patch }),
  deleteReward: (storeId: string, rewardId: string) =>
    request<{ ok: boolean }>(`/owner/stores/${storeId}/rewards/${rewardId}`, { method: 'DELETE' }),

  saveTiers: (storeId: string, tiers: OwnerTier[]) =>
    request<{ store: OwnerStore; warnings: string[] }>(`/owner/stores/${storeId}/tiers`, { method: 'PUT', json: { tiers } }),

  listSubmissions: (storeId: string, filters: CustomerFilters = {}) =>
    request<CustomerListResult>(`/owner/stores/${storeId}/submissions${queryString(filters)}`),
  getStats: (storeId: string) => request<DashboardStats>(`/owner/stores/${storeId}/stats`),
  collect: (storeId: string, submissionId: string) =>
    request<{ id: string }>(`/owner/stores/${storeId}/submissions/${submissionId}/collect`, { method: 'POST' }),
  exportUrl: (storeId: string) => `/api/owner/stores/${storeId}/submissions/export.csv`,

  getSubscription: (storeId: string) =>
    request<{ subscription: SubscriptionSummary | null; usageThisMonth: number; providerConfigured: boolean }>(`/owner/stores/${storeId}/subscription`),
  checkout: (storeId: string, planId: string) =>
    request<{ provider: string; subscriptionId: string; keyId: string; planId: string }>(`/owner/stores/${storeId}/subscription/checkout`, { method: 'POST', json: { planId } }),
  cancelSubscription: (storeId: string) =>
    request<{ ok: boolean }>(`/owner/stores/${storeId}/subscription/cancel`, { method: 'POST' }),

  // --- platform admin -------------------------------------------------------
  adminMetrics: () => request<PlatformMetrics>('/admin/metrics'),
  adminStores: (search?: string) => request<{ stores: PlatformStore[] }>(`/admin/stores${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  adminStore: (storeId: string) =>
    request<{ store: Record<string, unknown>; subscription: Record<string, unknown> | null; members: Array<{ role: string; email: string; full_name: string | null }>; billingEvents: Array<Record<string, unknown>> }>(
      `/admin/stores/${storeId}`,
    ),
  adminUpdateStore: (storeId: string, body: { status?: string; subscriptionStatus?: string; planId?: string; extendTrialDays?: number }) =>
    request<{ ok: boolean; actions: string[] }>(`/admin/stores/${storeId}`, { method: 'PATCH', json: body }),
  adminPlans: () => request<{ plans: Plan[] }>('/admin/plans'),
  adminUpdatePlan: (planId: string, patch: Record<string, unknown>) =>
    request<Plan>(`/admin/plans/${planId}`, { method: 'PATCH', json: patch }),
}

export type { Membership }
