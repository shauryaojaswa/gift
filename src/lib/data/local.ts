import type { Reward, RewardTier, StoreConfig } from '../../types'
import { ALL_STORES } from '../stores'
import type {
  AdminSession,
  CreateSubmissionInput,
  DataProvider,
  ListOptions,
  ListResult,
  SubmissionRecord,
  AdminStats,
  StorePatch,
} from './types'

const SUBMISSIONS_KEY = (storeId: string) => `gift:local:submissions:${storeId}`
const STORE_KEY = (slug: string) => `gift:local:store:${slug}`
const ADMIN_KEY = 'gift:local:admin:session'
function randId(prefix = 'sub'): string {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8).toUpperCase() : Math.random().toString(36).slice(2, 10).toUpperCase()
  return `${prefix}_${suffix}`
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded - ignore */
  }
}

function readSession(): AdminSession | null {
  return readJSON<AdminSession | null>(ADMIN_KEY, null)
}

export class LocalDataProvider implements DataProvider {
  private storeCache = new Map<string, StoreConfig>()

  async getStoreConfig(slug: string): Promise<StoreConfig | null> {
    const cached = this.storeCache.get(slug)
    if (cached) return cached
    const seed = ALL_STORES.find((s) => s.slug === slug)
    if (!seed) return null
    const edited = readJSON<Partial<StoreConfig> | null>(STORE_KEY(slug), null)
    if (!edited) {
      this.storeCache.set(slug, seed)
      return seed
    }
    const merged: StoreConfig = {
      ...seed,
      ...edited,
      rewards: edited.rewards ?? seed.rewards,
      tiers: edited.tiers ?? seed.tiers,
    }
    this.storeCache.set(slug, merged)
    return merged
  }

  async createSubmission(input: CreateSubmissionInput): Promise<{ id: string }> {
    const id = randId('sub')
    const record: SubmissionRecord = {
      id,
      storeId: input.storeId,
      storeName: input.storeName,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      purchaseAmount: input.purchaseAmount,
      rewardId: input.reward.id,
      rewardLabel: input.reward.name,
      rewardDescription: input.reward.description,
      couponCode: `${input.reward.claimCodePrefix ?? 'GIFT'}-${input.purchaseAmount}-${randId('')}`,
      reviewCtaShown: input.reviewCtaShown,
      reviewCtaClicked: input.reviewCtaClicked,
      createdAt: new Date().toISOString(),
    }
    const existing = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(input.storeId), [])
    existing.unshift(record)
    writeJSON(SUBMISSIONS_KEY(input.storeId), existing)
    return { id }
  }

  async signInAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    void email
    void password
    return { ok: false, error: 'Admin sign-in requires a configured Supabase project.' }
  }

  async signOut(): Promise<void> {
    window.localStorage.removeItem(ADMIN_KEY)
  }

  async getSession(): Promise<AdminSession | null> {
    return readSession()
  }

  async listSubmissions(opts: ListOptions): Promise<ListResult> {
    const store = await this.currentStore()
    const all = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), [])
    const search = opts.search.trim().toLowerCase()
    const filtered = search
      ? all.filter(
          (r) =>
            r.customerName.toLowerCase().includes(search) ||
            r.customerPhone.includes(search) ||
            r.rewardLabel.toLowerCase().includes(search) ||
            (r.couponCode?.toLowerCase() ?? '').includes(search),
        )
      : all
    const total = filtered.length
    const pageCount = Math.max(1, Math.ceil(total / opts.pageSize))
    const from = (opts.page - 1) * opts.pageSize
    const pageItems = filtered.slice(from, from + opts.pageSize)
    return {
      items: pageItems,
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      pageCount,
    }
  }

  async getStats(): Promise<AdminStats> {
    const store = await this.currentStore()
    const all = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), [])
    const totalSubmissions = all.length
    const totalCustomers = new Set(all.map((r) => r.customerPhone)).size
    const averagePurchaseAmount = totalSubmissions
      ? Math.round(all.reduce((sum, r) => sum + r.purchaseAmount, 0) / totalSubmissions)
      : 0
    const rewardDistribution: Record<string, number> = {}
    for (const r of all) {
      rewardDistribution[r.rewardLabel] = (rewardDistribution[r.rewardLabel] ?? 0) + 1
    }
    const reviewCtaClicks = all.filter((r) => r.reviewCtaClicked).length
    return { totalSubmissions, totalCustomers, averagePurchaseAmount, rewardDistribution, reviewCtaClicks }
  }

  async upsertReward(reward: Reward): Promise<Reward> {
    const store = await this.mutateStore()
    const idx = store.rewards.findIndex((r) => r.id === reward.id)
    if (idx >= 0) store.rewards[idx] = reward
    else store.rewards = [...store.rewards, reward]
    this.persistStore(store)
    return reward
  }

  async deleteReward(id: string): Promise<void> {
    const store = await this.mutateStore()
    store.rewards = store.rewards.filter((r) => r.id !== id)
    store.tiers = store.tiers.filter((t) => t.rewardId !== id)
    this.persistStore(store)
  }

  async upsertTier(tier: RewardTier): Promise<RewardTier> {
    const store = await this.mutateStore()
    const idx = store.tiers.findIndex((t) => t.id === tier.id)
    if (idx >= 0) store.tiers[idx] = tier
    else store.tiers = [...store.tiers, tier]
    this.persistStore(store)
    return tier
  }

  async deleteTier(id: string): Promise<void> {
    const store = await this.mutateStore()
    store.tiers = store.tiers.filter((t) => t.id !== id)
    this.persistStore(store)
  }

  async updateStore(patch: StorePatch): Promise<StoreConfig> {
    const store = await this.getStoreConfig('jolly-enterprises')
    if (!store) throw new Error('No active store')
    Object.assign(store, patch)
    this.persistStore(store)
    return store
  }

  private persistStore(store: StoreConfig): void {
    writeJSON(STORE_KEY(store.slug), store)
    this.storeCache.set(store.slug, store)
  }

  private async currentStore(): Promise<StoreConfig> {
    const store = await this.getStoreConfig('jolly-enterprises')
    if (!store) throw new Error('No active store')
    return store
  }

  private async mutateStore(): Promise<StoreConfig> {
    return this.currentStore()
  }
}

export function defaultReviewUrl(slug: string): string | null {
  const store = ALL_STORES.find((s) => s.slug === slug)
  return store?.googleReviewUrl ?? null
}
