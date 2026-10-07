import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import type { Reward, RewardTier, StoreConfig } from '../../types'
import type {
  AdminSession,
  CreateSubmissionInput,
  DataProvider,
  ListOptions,
  ListResult,
  StorePatch,
  SubmissionRecord,
  AdminStats,
} from './types'

type Client = SupabaseClient<Database>

function rowToStore(row: Database['public']['Tables']['stores']['Row']): StoreConfig {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle ?? 'CUSTOMER EXPERIENCE',
    logoUrl: row.logo_url ?? '/logo-placeholder.svg',
    primaryColor: row.primary_color ?? 'hsl(355 85% 45%)',
    secondaryColor: row.secondary_color ?? 'hsl(200 90% 55%)',
    googleReviewUrl: row.google_review_url ?? null,
    campaignBadge: row.campaign_badge ?? null,
    minSpinAmount: row.min_spin_amount ?? 10000,
    rewards: [],
    tiers: [],
  }
}

export class SupabaseDataProvider implements DataProvider {
  private client: Client
  constructor(client: Client) {
    this.client = client
  }

  async getStoreConfig(slug: string): Promise<StoreConfig | null> {
    const { data: store, error } = await this.client
      .from('stores')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
    if (error || !store) return null

    const { data: rewards } = await this.client
      .from('rewards')
      .select('*')
      .eq('store_id', store.id)
      .eq('active', true)
    const { data: tiers } = await this.client
      .from('reward_tiers')
      .select('*')
      .eq('store_id', store.id)
      .eq('active', true)

    return {
      ...rowToStore(store),
      rewards: (rewards ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        claimCodePrefix: r.claim_code_prefix,
        validityText: r.validity_text,
        active: r.active,
      })),
      tiers: (tiers ?? []).map((t) => ({
        id: t.id,
        minAmount: t.min_amount,
        maxAmount: t.max_amount,
        rewardId: t.reward_id,
        targetSegment: t.target_segment,
        active: t.active,
      })),
    }
  }

  async createSubmission(input: CreateSubmissionInput): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from('submissions')
      .insert({
        store_id: input.storeId,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        purchase_amount: input.purchaseAmount,
        reward_id: input.reward.id,
        reward_label: input.reward.name,
        reward_description: input.reward.description,
        coupon_code: `CARE-${input.purchaseAmount}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        review_cta_shown: input.reviewCtaShown,
        review_cta_clicked: input.reviewCtaClicked,
      })
      .select('id')
    if (error || !data?.[0]) throw new Error(error?.message ?? 'Failed to create submission')
    return { id: data[0].id }
  }

  async signInAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
  }

  async getSession(): Promise<AdminSession | null> {
    const {
      data: { session },
    } = await this.client.auth.getSession()
    if (!session?.user) return null
    return { id: session.user.id, email: session.user.email ?? '' }
  }

  async listSubmissions(opts: ListOptions): Promise<ListResult> {
    const session = await this.getSession()
    const adminStoreId = await this.adminStoreId(session)
    const rangeTo = opts.page * opts.pageSize - 1
    const rangeFrom = (opts.page - 1) * opts.pageSize
    const search = opts.search.trim()
    let query = this.client
      .from('submissions')
      .select('*', { count: 'exact' })
      .eq('store_id', adminStoreId)
    if (search) {
      query = query.ilike('customer_name', `%${search}%`)
    }
    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(rangeFrom, rangeTo)
    if (error) throw new Error(error.message)
    const items: SubmissionRecord[] = (data ?? []).map((r) => ({
      id: r.id,
      storeId: r.store_id,
      storeName: '',
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      purchaseAmount: r.purchase_amount,
      rewardId: r.reward_id,
      rewardLabel: r.reward_label,
      rewardDescription: r.reward_description ?? '',
      couponCode: r.coupon_code,
      reviewCtaShown: r.review_cta_shown,
      reviewCtaClicked: r.review_cta_clicked,
      createdAt: r.created_at,
    }))
    const total = count ?? items.length
    return {
      items,
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      pageCount: Math.max(1, Math.ceil(total / opts.pageSize)),
    }
  }

  async getStats(): Promise<AdminStats> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const { data, error } = await this.client
      .from('submissions')
      .select('customer_phone, purchase_amount, reward_label, review_cta_clicked')
      .eq('store_id', storeId)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    const totalSubmissions = rows.length
    const totalCustomers = new Set(rows.map((r) => r.customer_phone)).size
    const averagePurchaseAmount = totalSubmissions
      ? Math.round(rows.reduce((sum, r) => sum + (r.purchase_amount ?? 0), 0) / totalSubmissions)
      : 0
    const rewardDistribution: Record<string, number> = {}
    for (const r of rows) {
      const label = r.reward_label ?? 'Unknown'
      rewardDistribution[label] = (rewardDistribution[label] ?? 0) + 1
    }
    const reviewCtaClicks = rows.filter((r) => r.review_cta_clicked).length
    return { totalSubmissions, totalCustomers, averagePurchaseAmount, rewardDistribution, reviewCtaClicks }
  }

  async upsertReward(reward: Reward): Promise<Reward> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const { error } = await this.client.from('rewards').upsert({
      id: reward.id,
      store_id: storeId,
      name: reward.name,
      description: reward.description,
      claim_code_prefix: reward.claimCodePrefix,
      validity_text: reward.validityText,
      active: reward.active,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
    return reward
  }

  async deleteReward(id: string): Promise<void> {
    const { error } = await this.client.from('rewards').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async upsertTier(tier: RewardTier): Promise<RewardTier> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const { error } = await this.client.from('reward_tiers').upsert({
      id: tier.id,
      store_id: storeId,
      min_amount: tier.minAmount,
      max_amount: tier.maxAmount,
      reward_id: tier.rewardId,
      target_segment: tier.targetSegment,
      active: tier.active,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
    return tier
  }

  async deleteTier(id: string): Promise<void> {
    const { error } = await this.client.from('reward_tiers').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async updateStore(patch: StorePatch): Promise<StoreConfig> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const updates: Database['public']['Tables']['stores']['Update'] = {}
    if (patch.name) updates.name = patch.name
    if (patch.subtitle) updates.subtitle = patch.subtitle
    if (patch.logoUrl) updates.logo_url = patch.logoUrl
    if (patch.primaryColor) updates.primary_color = patch.primaryColor
    if (patch.secondaryColor) updates.secondary_color = patch.secondaryColor
    if (patch.googleReviewUrl !== undefined) updates.google_review_url = patch.googleReviewUrl
    if (patch.campaignBadge !== undefined) updates.campaign_badge = patch.campaignBadge
    if (patch.minSpinAmount) updates.min_spin_amount = patch.minSpinAmount
    updates.updated_at = new Date().toISOString()
    const { error } = await this.client.from('stores').update(updates).eq('id', storeId)
    if (error) throw new Error(error.message)
    return this.fetchStoreById(storeId)
  }

  private async fetchStoreById(storeId: string): Promise<StoreConfig> {
    const { data: store, error } = await this.client
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle()
    if (error || !store) throw new Error('Store not found')
    const { data: rewards } = await this.client.from('rewards').select('*').eq('store_id', store.id)
    const { data: tiers } = await this.client.from('reward_tiers').select('*').eq('store_id', store.id)
    return {
      ...rowToStore(store),
      rewards: (rewards ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        claimCodePrefix: r.claim_code_prefix,
        validityText: r.validity_text,
        active: r.active,
      })),
      tiers: (tiers ?? []).map((t) => ({
        id: t.id,
        minAmount: t.min_amount,
        maxAmount: t.max_amount,
        rewardId: t.reward_id,
        targetSegment: t.target_segment,
        active: t.active,
      })),
    }
  }

  private async adminStoreId(session: AdminSession | null): Promise<string> {
    const userId = session?.id ?? ''
    const { data, error } = await this.client
      .from('store_admins')
      .select('store_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) throw new Error('Admin has no associated store')
    return data.store_id
  }
}
