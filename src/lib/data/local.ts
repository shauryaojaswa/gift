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
  RewardAssignment,
} from './types'
import { evaluateReward, validateTierConfiguration } from '../reward-engine'

const SUBMISSIONS_KEY = (storeId: string) => `gift:local:submissions:${storeId}`
const STORE_KEY = (slug: string) => `gift:local:store:${slug}`
const ADMIN_KEY = 'gift:local:admin:session'
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

  async getAdminStoreConfig(): Promise<StoreConfig | null> {
    return this.getStoreConfig('jolly-enterprises')
  }

  async createSubmission(input: CreateSubmissionInput): Promise<RewardAssignment> {
    const store = await this.getStoreConfig(input.storeSlug)
    if (!store) throw new Error('Campaign not found')
    const id = input.requestId
    const existing = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), [])
      .find((record) => record.id === id)
    if (existing) {
      if (
        existing.customerName !== input.customerName.trim() ||
        existing.customerPhone !== input.customerPhone ||
        existing.purchaseAmount !== input.purchaseAmount
      ) {
        throw new Error('This entry reference has already been used')
      }
      const configuredTier = store.tiers.find((item) => item.id === existing.tierId)
      const reward: Reward = {
        id: existing.rewardId,
        name: existing.rewardLabel,
        shortLabel: existing.rewardShortLabel ?? undefined,
        description: existing.rewardDescription,
        voucherValue: existing.rewardVoucherValue,
        claimCodePrefix: existing.rewardClaimCodePrefix,
        validityText: existing.rewardValidityText,
        active: true,
      }
      const tier: RewardTier = {
        id: existing.tierId || configuredTier?.id || '',
        minAmount: existing.tierMinAmount || configuredTier?.minAmount || 0,
        maxAmount: existing.tierMaxAmount ?? configuredTier?.maxAmount ?? null,
        rewardId: existing.rewardId,
        targetSegment: existing.targetSegment ?? configuredTier?.targetSegment ?? 0,
        active: true,
      }
      if (!tier.id) throw new Error('Previously assigned purchase tier is missing')
      return {
        id,
        reward,
        tier,
        claimCode: existing.couponCode ?? `${reward.claimCodePrefix ?? 'GIFT'}-${id.slice(-6).toUpperCase()}`,
      }
    }
    const result = evaluateReward(input.purchaseAmount, store)
    if (!result) throw new Error('Purchase does not qualify for an active reward')
    const record: SubmissionRecord = {
      id,
      storeId: store.id,
      storeName: store.name,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone,
      purchaseAmount: input.purchaseAmount,
      rewardId: result.reward.id,
      rewardLabel: result.reward.name,
      rewardDescription: result.reward.description,
      rewardShortLabel: result.reward.shortLabel ?? null,
      rewardClaimCodePrefix: result.reward.claimCodePrefix,
      rewardValidityText: result.reward.validityText,
      rewardVoucherValue: result.reward.voucherValue ?? null,
      tierId: result.tier.id,
      tierMinAmount: result.tier.minAmount,
      tierMaxAmount: result.tier.maxAmount,
      targetSegment: result.tier.targetSegment,
      couponCode: `${result.reward.claimCodePrefix ?? 'GIFT'}-${id.slice(-6).toUpperCase()}`,
      collectionStatus: 'awaiting',
      collectedAt: null,
      collectedBy: null,
      reviewCtaShown: input.reviewCtaShown,
      reviewCtaClicked: input.reviewCtaClicked,
      createdAt: new Date().toISOString(),
    }
    const records = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), [])
    records.unshift(record)
    writeJSON(SUBMISSIONS_KEY(store.id), records)
    return {
      id,
      reward: { ...result.reward },
      tier: { ...result.tier },
      claimCode: record.couponCode!,
    } satisfies RewardAssignment
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
    const all = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), []).map((record) => ({
      ...record,
      rewardShortLabel: record.rewardShortLabel ?? null,
      rewardClaimCodePrefix: record.rewardClaimCodePrefix ?? null,
      rewardValidityText: record.rewardValidityText ?? null,
      rewardVoucherValue: record.rewardVoucherValue ?? null,
      tierId: record.tierId ?? '',
      tierMinAmount: record.tierMinAmount ?? 0,
      tierMaxAmount: record.tierMaxAmount ?? null,
      targetSegment: record.targetSegment ?? 0,
      collectionStatus: record.collectionStatus ?? 'awaiting',
      collectedAt: record.collectedAt ?? null,
      collectedBy: record.collectedBy ?? null,
    }))
    const search = opts.search.trim().toLowerCase()
    const filtered = all.filter((record) => {
      const matchesSearch = !search ||
        record.customerName.toLowerCase().includes(search) ||
        record.customerPhone.includes(search) ||
        record.rewardLabel.toLowerCase().includes(search) ||
        (record.couponCode?.toLowerCase() ?? '').includes(search)
      const createdDate = record.createdAt.slice(0, 10)
      return matchesSearch
        && (!opts.dateFrom || createdDate >= opts.dateFrom)
        && (!opts.dateTo || createdDate <= opts.dateTo)
        && (opts.minPurchase === undefined || record.purchaseAmount >= opts.minPurchase)
        && (opts.maxPurchase === undefined || record.purchaseAmount <= opts.maxPurchase)
        && (!opts.rewardId || record.rewardId === opts.rewardId)
        && (!opts.collectionStatus || record.collectionStatus === opts.collectionStatus)
    })
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

  async markSubmissionCollected(id: string): Promise<void> {
    const store = await this.currentStore()
    const records = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), [])
    const record = records.find((item) => item.id === id)
    if (!record) throw new Error('Customer record not found')
    if (record.collectionStatus === 'collected') throw new Error('Gift has already been collected')
    record.collectionStatus = 'collected'
    record.collectedAt = new Date().toISOString()
    record.collectedBy = readSession()?.email ?? null
    writeJSON(SUBMISSIONS_KEY(store.id), records)
  }

  async getStats(): Promise<AdminStats> {
    const store = await this.currentStore()
    const all = readJSON<SubmissionRecord[]>(SUBMISSIONS_KEY(store.id), [])
    const totalSubmissions = all.length
    const totalCustomers = new Set(all.map((r) => r.customerPhone)).size
    const totalPurchaseValue = all.reduce((sum, r) => sum + r.purchaseAmount, 0)
    const awaitingCollection = all.filter((record) => record.collectionStatus !== 'collected').length
    const collectedGifts = all.filter((record) => record.collectionStatus === 'collected').length
    const rewardDistribution: Record<string, number> = {}
    for (const r of all) {
      rewardDistribution[r.rewardLabel] = (rewardDistribution[r.rewardLabel] ?? 0) + 1
    }
    const reviewCtaClicks = all.filter((r) => r.reviewCtaClicked).length
    return { totalSubmissions, totalCustomers, totalPurchaseValue, awaitingCollection, collectedGifts, rewardDistribution, reviewCtaClicks }
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

  async saveTierConfiguration(tiers: RewardTier[]): Promise<void> {
    const store = await this.mutateStore()
    const validation = validateTierConfiguration(tiers, store.minSpinAmount, store.rewards)
    if (validation) throw new Error(validation)
    store.tiers = tiers
    this.persistStore(store)
  }

  async updateStore(patch: StorePatch): Promise<StoreConfig> {
    const store = await this.getAdminStoreConfig()
    if (!store) throw new Error('No active store')
    Object.assign(store, patch)
    this.persistStore(store)
    return store
  }

  async uploadStoreLogo(file: File): Promise<string> {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      throw new Error('Choose an image smaller than 5 MB')
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image'))
      reader.onerror = () => reject(new Error('Could not read image'))
      reader.readAsDataURL(file)
    })
    await this.updateStore({ logoUrl: dataUrl })
    return dataUrl
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
