import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { validateLogoFile } from '@/lib/logo-upload'

/**
 * Platform-admin API (JRIQ control plane). All writes go through
 * SECURITY DEFINER RPCs that verify `is_platform_admin()` server-side — the UI
 * is never the security boundary. Tenant isolation is enforced by RLS.
 */
export type PlatformClient = SupabaseClient<Database>

export interface ShopRow {
  id: string
  slug: string
  name: string
  status: 'active' | 'suspended' | 'onboarding'
  active: boolean
  minSpinAmount: number
  logoUrl: string | null
  ownerEmail: string | null
  ownerStatus: 'pending' | 'linked' | 'revoked' | null
  createdAt: string
}

export interface CatalogGift {
  id: string
  name: string
  wheelLabel: string
  description: string | null
  imageUrl: string | null
  voucherValue: number | null
  claimCodePrefix: string | null
  validityText: string | null
  active: boolean
}

export interface TierWithPool {
  id: string
  minAmount: number
  maxAmount: number | null
  targetSegment: number
  active: boolean
  rewardId: string | null
  rewardName: string | null
  pool: Array<{ rewardId: string; catalogGiftId: string | null; giftName: string }>
}

type OwnerStatus = 'pending' | 'linked' | 'revoked'

/**
 * PostgREST may return a to-one embedded relation as an object or a single-row
 * array depending on relationship detection; normalize both shapes.
 */
function firstRelation<T>(value: T[] | T | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

function toOwnerStatus(value: string | undefined): OwnerStatus | null {
  return value === 'pending' || value === 'linked' || value === 'revoked' ? value : null
}

export async function isPlatformAdmin(client: PlatformClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}

export async function listShops(client: PlatformClient): Promise<ShopRow[]> {
  const { data, error } = await client
    .from('stores')
    .select('*, store_owner_invitations(email, status), store_admins(email, role)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const invitation = firstRelation(
      row.store_owner_invitations as { email: string; status: string }[] | { email: string; status: string } | null,
    )
    const membership = firstRelation(
      (row.store_admins ?? []) as Array<{ email: string; role: string }>,
    )
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status as ShopRow['status'],
      active: row.active,
      minSpinAmount: row.min_spin_amount ?? 10000,
      logoUrl: row.logo_url,
      ownerEmail: invitation?.email ?? membership?.email ?? null,
      ownerStatus: toOwnerStatus(invitation?.status) ?? (membership ? 'linked' : null),
      createdAt: row.created_at,
    }
  })
}

export interface CreateShopResult {
  shopId: string
  shopSlug: string
  shopName: string
  customerPath: string
  ownerLinkStatus: string
}

export async function createShop(
  client: PlatformClient,
  input: { name: string; slug: string; ownerEmail: string; logoUrl?: string | null },
): Promise<CreateShopResult> {
  const { data, error } = await client.rpc('create_shop', {
    p_name: input.name,
    p_slug: input.slug,
    p_owner_email: input.ownerEmail,
    p_logo_url: input.logoUrl ?? undefined,
    p_tiers: null,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('create_shop returned no result')
  return {
    shopId: row.shop_id,
    shopSlug: row.shop_slug,
    shopName: row.shop_name,
    customerPath: row.customer_path,
    ownerLinkStatus: row.owner_link_status,
  }
}

/**
 * Upload a shop logo before the shop exists (new-shop wizard). Platform
 * admins may upload anywhere in the `store-logos` bucket (storage policy);
 * the resulting public URL is passed to create_shop as p_logo_url.
 */
export async function uploadShopLogo(client: PlatformClient, file: File): Promise<string> {
  const validation = validateLogoFile(file)
  if (!validation.ok) throw new Error(validation.error)
  const path = `new-shops/${crypto.randomUUID()}.${validation.extension}`
  const { error } = await client.storage
    .from('store-logos')
    .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
  if (error) throw new Error(error.message)
  return client.storage.from('store-logos').getPublicUrl(path).data.publicUrl
}

export async function setStoreStatus(
  client: PlatformClient,
  storeId: string,
  status: 'active' | 'suspended' | 'onboarding',
): Promise<void> {
  const { error } = await client.rpc('set_store_status', { p_store_id: storeId, p_status: status })
  if (error) throw new Error(error.message)
}

export async function linkStoreOwner(
  client: PlatformClient,
  storeId: string,
  email: string,
): Promise<string> {
  const { data, error } = await client.rpc('link_store_owner', { p_store_id: storeId, p_email: email })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listCatalog(client: PlatformClient, includeInactive = true): Promise<CatalogGift[]> {
  let query = client.from('gift_catalog').select('*').order('name')
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    wheelLabel: row.wheel_label,
    description: row.description,
    imageUrl: row.image_url,
    voucherValue: row.voucher_value,
    claimCodePrefix: row.claim_code_prefix,
    validityText: row.validity_text,
    active: row.active,
  }))
}

export type CatalogGiftInput = Omit<CatalogGift, 'id'>

export async function createCatalogGift(
  client: PlatformClient,
  input: CatalogGiftInput,
): Promise<CatalogGift> {
  const { data, error } = await client
    .from('gift_catalog')
    .insert({
      name: input.name,
      wheel_label: input.wheelLabel,
      description: input.description,
      image_url: input.imageUrl,
      voucher_value: input.voucherValue,
      claim_code_prefix: input.claimCodePrefix,
      validity_text: input.validityText,
      active: input.active,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return { ...input, id: data.id }
}

export async function updateCatalogGift(
  client: PlatformClient,
  id: string,
  input: Partial<CatalogGiftInput>,
): Promise<void> {
  const patch: Database['public']['Tables']['gift_catalog']['Update'] = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.wheelLabel !== undefined) patch.wheel_label = input.wheelLabel
  if (input.description !== undefined) patch.description = input.description
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl
  if (input.voucherValue !== undefined) patch.voucher_value = input.voucherValue
  if (input.claimCodePrefix !== undefined) patch.claim_code_prefix = input.claimCodePrefix
  if (input.validityText !== undefined) patch.validity_text = input.validityText
  if (input.active !== undefined) patch.active = input.active
  const { error } = await client.from('gift_catalog').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listTiersWithPools(
  client: PlatformClient,
  storeId: string,
): Promise<TierWithPool[]> {
  const { data: tiers, error } = await client
    .from('reward_tiers')
    .select('*, rewards(name), tier_gift_options(reward_id, rewards(name, catalog_gift_id))')
    .eq('store_id', storeId)
    .order('min_amount')
  if (error) throw new Error(error.message)
  return (tiers ?? []).map((row) => {
    const reward = row.rewards as { name: string } | null
    const options = (row.tier_gift_options ?? []) as Array<{
      reward_id: string
      rewards: { name: string; catalog_gift_id: string | null } | null
    }>
    return {
      id: row.id,
      minAmount: row.min_amount,
      maxAmount: row.max_amount,
      targetSegment: row.target_segment,
      active: row.active,
      rewardId: row.reward_id,
      rewardName: reward?.name ?? null,
      pool: options.map((o) => ({
        rewardId: o.reward_id,
        catalogGiftId: o.rewards?.catalog_gift_id ?? null,
        giftName: o.rewards?.name ?? 'Gift',
      })),
    }
  })
}

export async function saveGiftOptions(
  client: PlatformClient,
  tierId: string,
  catalogGiftIds: string[],
): Promise<void> {
  const { error } = await client.rpc('save_store_gift_options', {
    p_tier_id: tierId,
    p_catalog_gift_ids: catalogGiftIds,
  })
  if (error) throw new Error(error.message)
}
