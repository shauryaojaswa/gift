import type { Reward, RewardTier, StoreConfig } from '../../types'
import { api } from '../api'
import type {
  AdminSession,
  AdminStats,
  CreateSubmissionInput,
  DataProvider,
  ListOptions,
  ListResult,
  StorePatch,
} from './types'

/** StoreConfig returned by the public campaign endpoint. */
type PublicStore = StoreConfig & { campaignActive: boolean; campaignMessage: string | null }

function toStoreConfig(store: PublicStore): StoreConfig {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    subtitle: store.subtitle,
    logoUrl: store.logoUrl,
    primaryColor: store.primaryColor,
    secondaryColor: store.secondaryColor,
    googleReviewUrl: store.googleReviewUrl,
    campaignBadge: store.campaignBadge,
    minSpinAmount: store.minSpinAmount,
    campaignActive: store.campaignActive,
    campaignMessage: store.campaignMessage,
    rewards: store.rewards.map((r) => ({
      id: r.id,
      name: r.name,
      wheelLabel: (r as Reward).wheelLabel ?? r.name,
      description: r.description,
      voucherAmount: (r as Reward).voucherAmount ?? null,
      claimCodePrefix: r.claimCodePrefix,
      validityText: r.validityText,
      active: r.active,
    })),
    tiers: store.tiers,
  }
}

/**
 * Data provider backed by the platform API. Used by the customer campaign
 * and by any surface that reads a store's public configuration.
 */
export class ApiDataProvider implements DataProvider {
  private storeCache = new Map<string, StoreConfig>()

  async getStoreConfig(slug: string): Promise<StoreConfig | null> {
    const cached = this.storeCache.get(slug)
    if (cached) return cached
    try {
      const store = await api.getPublicStore(slug)
      const config = toStoreConfig(store)
      this.storeCache.set(slug, config)
      return config
    } catch {
      return null
    }
  }

  async createSubmission(input: CreateSubmissionInput): Promise<{ id: string }> {
    const result = await api.createPublicSubmission(input.storeSlug ?? '', {
      customerName: input.customerName,
      phone: input.customerPhone,
      purchaseAmount: input.purchaseAmount,
      reviewCtaShown: input.reviewCtaShown,
      reviewCtaClicked: input.reviewCtaClicked,
    })
    return { id: result.submissionId }
  }

  async signInAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.login({ email, password })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Sign-in failed' }
    }
  }

  async signOut(): Promise<void> {
    await api.logout()
  }

  async getSession(): Promise<AdminSession | null> {
    const session = await api.me()
    return session.user ? { id: session.user.id, email: session.user.email } : null
  }

  // The owner dashboard reads these directly through the API client.
  async listSubmissions(_opts: ListOptions): Promise<ListResult> {
    throw new Error('Use the dashboard API for customer records.')
  }

  async getStats(): Promise<AdminStats> {
    throw new Error('Use the dashboard API for store statistics.')
  }

  async upsertReward(reward: Reward): Promise<Reward> {
    return reward
  }

  async deleteReward(_id: string): Promise<void> {}

  async upsertTier(tier: RewardTier): Promise<RewardTier> {
    return tier
  }

  async deleteTier(_id: string): Promise<void> {}

  async updateStore(patch: StorePatch): Promise<StoreConfig> {
    void patch
    throw new Error('Use the dashboard API to update store settings.')
  }
}
