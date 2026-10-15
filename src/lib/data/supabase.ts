import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../database.types'
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
  RewardAssignment,
} from './types'

type Client = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// Typed accessors for submit_customer_entry's jsonb result columns. The RPC
// contract returns the saved reward/tier snapshot as jsonb (see
// 20261015161200_reward_engine_multipool.sql); fields are validated here so a
// malformed payload fails loudly instead of inventing data.
// ---------------------------------------------------------------------------

interface AssignmentRewardJson {
  id: string
  name: string
  wheel_label: string | null
  description: string | null
  voucher_value: number | null
  claim_code_prefix: string | null
  validity_text: string | null
  active: boolean
}

interface AssignmentTierJson {
  id: string
  min_amount: number
  max_amount: number | null
  reward_id: string | null
  target_segment: number
  active: boolean
}

function jsonRecord(value: Json | undefined, label: string): Record<string, Json | undefined> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Malformed ${label} in reward assignment`)
  }
  return value as Record<string, Json | undefined>
}

function requiredText(rec: Record<string, Json | undefined>, key: string, label: string): string {
  const value = rec[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Malformed ${label}: missing ${key}`)
  }
  return value
}

function optionalText(rec: Record<string, Json | undefined>, key: string): string | null {
  const value = rec[key]
  return typeof value === 'string' ? value : null
}

function optionalNumber(rec: Record<string, Json | undefined>, key: string): number | null {
  const value = rec[key]
  return typeof value === 'number' ? value : null
}

function requiredNumber(rec: Record<string, Json | undefined>, key: string, label: string): number {
  const value = rec[key]
  if (typeof value !== 'number') throw new Error(`Malformed ${label}: missing ${key}`)
  return value
}

/** Exported for unit tests (malformed-payload and status-mapping behaviour). */
export function parseAssignmentReward(value: Json | undefined): AssignmentRewardJson {
  const rec = jsonRecord(value, 'reward')
  return {
    id: requiredText(rec, 'id', 'reward'),
    name: requiredText(rec, 'name', 'reward'),
    wheel_label: optionalText(rec, 'wheel_label'),
    description: optionalText(rec, 'description'),
    voucher_value: optionalNumber(rec, 'voucher_value'),
    claim_code_prefix: optionalText(rec, 'claim_code_prefix'),
    validity_text: optionalText(rec, 'validity_text'),
    active: rec.active === true,
  }
}

/** Exported for unit tests (malformed-payload and status-mapping behaviour). */
export function parseAssignmentTier(value: Json | undefined): AssignmentTierJson {
  const rec = jsonRecord(value, 'tier')
  return {
    id: requiredText(rec, 'id', 'tier'),
    min_amount: requiredNumber(rec, 'min_amount', 'tier'),
    max_amount: optionalNumber(rec, 'max_amount'),
    reward_id: optionalText(rec, 'reward_id'),
    target_segment: requiredNumber(rec, 'target_segment', 'tier'),
    active: rec.active === true,
  }
}

export function toCollectionStatus(value: string): 'awaiting' | 'collected' {
  return value === 'collected' ? 'collected' : 'awaiting'
}

function rowToStore(row: Database['public']['Tables']['stores']['Row']): StoreConfig {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle ?? 'CUSTOMER EXPERIENCE',
    logoUrl: row.logo_url || '/logo-placeholder.svg',
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
    if (error) throw new Error(error.message)
    if (!store) return null

    const { data: rewards, error: rewardsError } = await this.client
      .from('rewards')
      .select('*')
      .eq('store_id', store.id)
      .eq('active', true)
    const { data: tiers, error: tiersError } = await this.client
      .from('reward_tiers')
      .select('*')
      .eq('store_id', store.id)
      .eq('active', true)
    if (rewardsError) throw new Error(rewardsError.message)
    if (tiersError) throw new Error(tiersError.message)

    return {
      ...rowToStore(store),
      rewards: (rewards ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        shortLabel: r.wheel_label ?? undefined,
        description: r.description ?? '',
        voucherValue: r.voucher_value,
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

  async getAdminStoreConfig(): Promise<StoreConfig | null> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    return this.fetchStoreById(storeId)
  }

  async createSubmission(input: CreateSubmissionInput): Promise<RewardAssignment> {
    const { data, error } = await this.client.rpc('submit_customer_entry', {
      p_store_slug: input.storeSlug,
      p_request_id: input.requestId,
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_purchase_amount: input.purchaseAmount,
      p_review_cta_shown: input.reviewCtaShown,
      p_review_cta_clicked: input.reviewCtaClicked,
    })
    const assignment = data?.[0]
    if (error || !assignment) throw new Error(error?.message ?? 'Failed to assign a reward')
    const reward = parseAssignmentReward(assignment.reward)
    const tier = parseAssignmentTier(assignment.tier)
    return {
      id: assignment.submission_id,
      claimCode: assignment.claim_code,
      reward: {
        id: reward.id,
        name: reward.name,
        shortLabel: reward.wheel_label ?? undefined,
        description: reward.description ?? '',
        voucherValue: reward.voucher_value,
        claimCodePrefix: reward.claim_code_prefix,
        validityText: reward.validity_text,
        active: reward.active,
      },
      tier: {
        id: tier.id,
        minAmount: tier.min_amount,
        maxAmount: tier.max_amount,
        rewardId: tier.reward_id,
        targetSegment: tier.target_segment,
        active: tier.active,
      },
    }
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
    const search = opts.search.trim().replace(/[\\%_,()]/g, '\\$&')
    let query = this.client
      .from('submissions')
      .select('*', { count: 'exact' })
      .eq('store_id', adminStoreId)
    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,reward_label.ilike.%${search}%,coupon_code.ilike.%${search}%`,
      )
    }
    if (opts.dateFrom) query = query.gte('created_at', `${opts.dateFrom}T00:00:00`)
    if (opts.dateTo) {
      const exclusiveEnd = new Date(`${opts.dateTo}T00:00:00Z`)
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      query = query.lt('created_at', exclusiveEnd.toISOString())
    }
    if (opts.minPurchase !== undefined) query = query.gte('purchase_amount', opts.minPurchase)
    if (opts.maxPurchase !== undefined) query = query.lte('purchase_amount', opts.maxPurchase)
    if (opts.rewardId) query = query.eq('reward_id', opts.rewardId)
    if (opts.collectionStatus) query = query.eq('collection_status', opts.collectionStatus)
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
      rewardShortLabel: r.reward_wheel_label,
      rewardClaimCodePrefix: r.reward_claim_code_prefix,
      rewardValidityText: r.reward_validity_text,
      rewardVoucherValue: r.reward_voucher_value,
      tierId: r.assigned_tier_id ?? '',
      tierMinAmount: r.assigned_tier_min_amount ?? 0,
      tierMaxAmount: r.assigned_tier_max_amount,
      targetSegment: r.target_segment ?? 0,
      couponCode: r.coupon_code,
      collectionStatus: toCollectionStatus(r.collection_status),
      collectedAt: r.collected_at,
      collectedBy: r.collected_by,
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

  async markSubmissionCollected(id: string): Promise<void> {
    const { error } = await this.client.rpc('mark_submission_collected', {
      p_submission_id: id,
    })
    if (error) throw new Error(error.message)
  }

  async getStats(): Promise<AdminStats> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const { data, error } = await this.client
      .from('submissions')
      .select('customer_phone, purchase_amount, reward_label, review_cta_clicked, collection_status')
      .eq('store_id', storeId)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    const totalSubmissions = rows.length
    const totalCustomers = new Set(rows.map((r) => r.customer_phone)).size
    const totalPurchaseValue = rows.reduce((sum, r) => sum + (r.purchase_amount ?? 0), 0)
    const awaitingCollection = rows.filter((row) => row.collection_status === 'awaiting').length
    const collectedGifts = rows.filter((row) => row.collection_status === 'collected').length
    const rewardDistribution: Record<string, number> = {}
    for (const r of rows) {
      const label = r.reward_label ?? 'Unknown'
      rewardDistribution[label] = (rewardDistribution[label] ?? 0) + 1
    }
    const reviewCtaClicks = rows.filter((r) => r.review_cta_clicked).length
    return { totalSubmissions, totalCustomers, totalPurchaseValue, awaitingCollection, collectedGifts, rewardDistribution, reviewCtaClicks }
  }

  async upsertReward(reward: Reward): Promise<Reward> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    // rewards.wheel_label is NOT NULL (1-18 chars); fall back to a truncated
    // name when the short label is absent so the row is always valid.
    const wheelLabel = reward.shortLabel?.trim().slice(0, 18) || reward.name.trim().slice(0, 18)
    const { error } = await this.client.from('rewards').upsert({
      id: reward.id,
      store_id: storeId,
      name: reward.name,
      wheel_label: wheelLabel,
      description: reward.description,
      voucher_value: reward.voucherValue ?? null,
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

  async saveTierConfiguration(tiers: RewardTier[]): Promise<void> {
    const { error } = await this.client.rpc('save_store_tiers', {
      p_tiers: tiers.map((tier) => ({
        id: tier.id,
        min_amount: tier.minAmount,
        max_amount: tier.maxAmount,
        reward_id: tier.rewardId,
        target_segment: tier.targetSegment,
        active: tier.active,
      })),
    })
    if (error) throw new Error(error.message)
  }

  async updateStore(patch: StorePatch): Promise<StoreConfig> {
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const updates: Database['public']['Tables']['stores']['Update'] = {}
    if (patch.name !== undefined) updates.name = patch.name.trim()
    if (patch.subtitle !== undefined) updates.subtitle = patch.subtitle
    if (patch.logoUrl !== undefined) updates.logo_url = patch.logoUrl
    if (patch.primaryColor !== undefined) updates.primary_color = patch.primaryColor
    if (patch.secondaryColor !== undefined) updates.secondary_color = patch.secondaryColor
    if (patch.googleReviewUrl !== undefined) updates.google_review_url = patch.googleReviewUrl
    if (patch.campaignBadge !== undefined) updates.campaign_badge = patch.campaignBadge
    if (patch.minSpinAmount !== undefined) updates.min_spin_amount = patch.minSpinAmount
    updates.updated_at = new Date().toISOString()
    const { error } = await this.client.from('stores').update(updates).eq('id', storeId)
    if (error) throw new Error(error.message)
    return this.fetchStoreById(storeId)
  }

  async uploadStoreLogo(file: File): Promise<string> {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }
    const extension = extensions[file.type]
    if (!extension || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      throw new Error('Choose a JPG, PNG or WebP image smaller than 5 MB')
    }
    const session = await this.getSession()
    const storeId = await this.adminStoreId(session)
    const path = `${storeId}/${crypto.randomUUID()}.${extension}`
    const { error } = await this.client.storage
      .from('store-logos')
      .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
    if (error) throw new Error(error.message)
    const { data } = this.client.storage.from('store-logos').getPublicUrl(path)
    await this.updateStore({ logoUrl: data.publicUrl })
    return data.publicUrl
  }

  private async fetchStoreById(storeId: string): Promise<StoreConfig> {
    const { data: store, error } = await this.client
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle()
    if (error || !store) throw new Error('Store not found')
    const { data: rewards, error: rewardsError } = await this.client.from('rewards').select('*').eq('store_id', store.id)
    const { data: tiers, error: tiersError } = await this.client.from('reward_tiers').select('*').eq('store_id', store.id)
    if (rewardsError) throw new Error(rewardsError.message)
    if (tiersError) throw new Error(tiersError.message)
    return {
      ...rowToStore(store),
      rewards: (rewards ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        shortLabel: r.wheel_label ?? undefined,
        description: r.description ?? '',
        voucherValue: r.voucher_value,
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
