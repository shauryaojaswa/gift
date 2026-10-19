import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { validateLogoFile } from '@/lib/logo-upload'

/**
 * Platform-admin API (JRIQ control plane). All writes go through
 * SECURITY DEFINER RPCs that verify `is_platform_admin()` server-side — the UI
 * is never the security boundary. Tenant isolation is enforced by RLS.
 */
export type PlatformClient = SupabaseClient<Database>

/**
 * Optional gift-option schema extensions. The declared-value / stock columns
 * and the 4-argument `save_store_gift_options` ship in a later schema chain
 * than every deployment has: production still exposes only the 2-argument pool
 * save and rejects the extended columns with 42703. Callers probe once per
 * client and degrade to the deployed signatures instead of erroring, so the
 * platform surfaces work against both schema generations. Reward behaviour is
 * never part of this: nothing here changes how entries are drawn or awarded.
 */
export interface GiftSchemaSupport {
  /** `tier_gift_options.declared_value` — a shop may declare a gift's value. */
  declaredValues: boolean
  /** `tier_gift_options.quantity` / `quantity_claimed` — limited stock. */
  stock: boolean
  /** `gift_catalog.value_min` / `value_max` — platform price policy. */
  pricePolicy: boolean
  /** `gift_catalog.excluded_store_ids` — per-shop availability. */
  availability: boolean
}

const supportProbes = new WeakMap<object, Promise<GiftSchemaSupport>>()

async function hasColumn(
  client: PlatformClient,
  table: 'gift_catalog' | 'tier_gift_options',
  column: string,
): Promise<boolean> {
  // A missing column fails validation (42703) before any row is read, so an
  // empty result with no error proves the column exists.
  const { error } = await client.from(table).select(column).limit(1)
  return !error
}

/** Probe (once per client) which optional gift-option columns this backend has. */
export function fetchGiftSchemaSupport(client: PlatformClient): Promise<GiftSchemaSupport> {
  let probe = supportProbes.get(client)
  if (!probe) {
    probe = Promise.all([
      hasColumn(client, 'tier_gift_options', 'declared_value'),
      hasColumn(client, 'tier_gift_options', 'quantity'),
      hasColumn(client, 'gift_catalog', 'value_min'),
      hasColumn(client, 'gift_catalog', 'excluded_store_ids'),
    ]).then(([declaredValues, stock, pricePolicy, availability]) => ({
      declaredValues,
      stock,
      pricePolicy,
      availability,
    }))
    supportProbes.set(client, probe)
  }
  return probe
}

/** PGRST202 = "Could not find the function … in the schema cache". */
function isMissingRpc(error: { code?: string | null; message?: string } | null): boolean {
  return error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '')
}

/**
 * Blank entries mean "catalogue default value / unlimited" and travel as
 * omission, never as JSON null: `save_store_gift_options` validates every map
 * entry as a whole number and rejects null outright ("A gift value must be a
 * whole number"), while an omitted key resets the stored value to the default
 * on upsert. NaN/Infinity are dropped for the same reason.
 */
function pruneOptionalNumbers(
  map: Record<string, number | null> | undefined,
): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(map ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) out[id] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

export interface ShopRow {
  id: string
  slug: string
  name: string
  status: 'active' | 'suspended' | 'onboarding'
  active: boolean
  minSpinAmount: number
  logoUrl: string | null
  subtitle: string | null
  primaryColor: string | null
  secondaryColor: string | null
  campaignBadge: string | null
  googleReviewUrl: string | null
  reviewLinkOwnerEditable: boolean
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
  /** Platform price policy: lowest declared value a shop may set (null = fixed). */
  valueMin: number | null
  /** Platform price policy: highest declared value a shop may set (null = fixed). */
  valueMax: number | null
  /** Shops that may NOT select this gift (empty = available to every shop). */
  excludedStoreIds: string[]
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
  pool: Array<{
    rewardId: string
    catalogGiftId: string | null
    giftName: string
    declaredValue: number | null
    quantity: number | null
    quantityClaimed: number
  }>
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
      subtitle: row.subtitle,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      campaignBadge: row.campaign_badge,
      googleReviewUrl: row.google_review_url,
      reviewLinkOwnerEditable: row.review_link_owner_editable ?? true,
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
    // Absent optional columns read back as undefined; normalise so a fixed-value
    // gift on an older schema is indistinguishable from a deliberately fixed one.
    valueMin: row.value_min ?? null,
    valueMax: row.value_max ?? null,
    excludedStoreIds: row.excluded_store_ids ?? [],
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
  const support = await fetchGiftSchemaSupport(client)
  const row: Database['public']['Tables']['gift_catalog']['Insert'] = {
    name: input.name,
    wheel_label: input.wheelLabel,
    description: input.description,
    image_url: input.imageUrl,
    voucher_value: input.voucherValue,
    claim_code_prefix: input.claimCodePrefix,
    validity_text: input.validityText,
    active: input.active,
  }
  // The optional columns only exist on the newer schema; an older catalogue
  // rejects the whole insert if they are sent, so they are sent only when real.
  if (support.pricePolicy) {
    row.value_min = input.valueMin
    row.value_max = input.valueMax
  }
  if (support.availability) {
    row.excluded_store_ids = input.excludedStoreIds
  }
  const { data, error } = await client
    .from('gift_catalog')
    .insert(row)
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
  const support = await fetchGiftSchemaSupport(client)
  const patch: Database['public']['Tables']['gift_catalog']['Update'] = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.wheelLabel !== undefined) patch.wheel_label = input.wheelLabel
  if (input.description !== undefined) patch.description = input.description
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl
  if (input.voucherValue !== undefined) patch.voucher_value = input.voucherValue
  if (input.claimCodePrefix !== undefined) patch.claim_code_prefix = input.claimCodePrefix
  if (input.validityText !== undefined) patch.validity_text = input.validityText
  if (input.active !== undefined) patch.active = input.active
  // Optional columns are patched only when the backend actually has them.
  if (support.pricePolicy) {
    if (input.valueMin !== undefined) patch.value_min = input.valueMin
    if (input.valueMax !== undefined) patch.value_max = input.valueMax
  }
  if (support.availability && input.excludedStoreIds !== undefined) {
    patch.excluded_store_ids = input.excludedStoreIds
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await client.from('gift_catalog').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listTiersWithPools(
  client: PlatformClient,
  storeId: string,
): Promise<TierWithPool[]> {
  const support = await fetchGiftSchemaSupport(client)
  // Only columns this schema generation actually has are selected: an older
  // backend rejects the whole request with 42703 ("column … does not exist")
  // and the page would never load its brackets.
  const optionColumns = [
    'reward_id',
    'active',
    ...(support.declaredValues ? ['declared_value'] : []),
    ...(support.stock ? ['quantity', 'quantity_claimed'] : []),
    'rewards(name, catalog_gift_id)',
  ].join(', ')
  const { data, error } = await client
    .from('reward_tiers')
    .select(`*, rewards(name), tier_gift_options(${optionColumns})`)
    .eq('store_id', storeId)
    .order('min_amount')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Array<
    Database['public']['Tables']['reward_tiers']['Row'] & {
      rewards: { name: string } | null
      tier_gift_options: Array<{
        reward_id: string
        declared_value?: number | null
        quantity?: number | null
        quantity_claimed?: number
        active: boolean
        rewards: { name: string; catalog_gift_id: string | null } | null
      }> | null
    }
  >
  return rows.map((row) => {
    const reward = row.rewards as { name: string } | null
    const options = (row.tier_gift_options ?? []) as Array<{
      reward_id: string
      declared_value?: number | null
      quantity?: number | null
      quantity_claimed?: number
      active: boolean
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
      // Only the bracket's live selection; retired rows keep their claim
      // history server-side but are not part of the editable pool.
      pool: options
        .filter((o) => o.active)
        .map((o) => ({
          rewardId: o.reward_id,
          catalogGiftId: o.rewards?.catalog_gift_id ?? null,
          giftName: o.rewards?.name ?? 'Gift',
          // Absent extended columns read back as undefined: normalise to the
          // "catalogue value, unlimited stock, nothing issued" defaults.
          declaredValue: o.declared_value ?? null,
          quantity: o.quantity ?? null,
          quantityClaimed: o.quantity_claimed ?? 0,
        })),
    }
  })
}

/**
 * Save one bracket's gift pool. `declaredValues` and `quantities` are keyed by
 * catalog gift id; an omitted or blank entry = catalogue default value /
 * unlimited (the stored override is reset). Server-side enforcement (count,
 * price policy, availability, quantity bounds) lives in
 * `save_store_gift_options`; this call surfaces its errors verbatim.
 *
 * The 4-argument RPC (declared values + quantities) ships with the stock /
 * price-policy schema; a generation that predates it only has the 2-argument
 * pool save. The deployed shape is called first and the other shape is retried
 * on PGRST202 so a save never fails merely because the schema generation
 * differs — on the older backend the extra fields have nowhere to live and the
 * pool selection is what is persisted.
 */
export async function saveGiftOptions(
  client: PlatformClient,
  tierId: string,
  catalogGiftIds: string[],
  declaredValues?: Record<string, number | null>,
  quantities?: Record<string, number | null>,
): Promise<void> {
  const support = await fetchGiftSchemaSupport(client)
  const extended = {
    p_tier_id: tierId,
    p_catalog_gift_ids: catalogGiftIds,
    p_declared_values: pruneOptionalNumbers(declaredValues),
    p_quantities: pruneOptionalNumbers(quantities),
  }
  const legacy = { p_tier_id: tierId, p_catalog_gift_ids: catalogGiftIds }
  const preferExtended = support.declaredValues || support.stock
  let { error } = await client.rpc(
    'save_store_gift_options',
    preferExtended ? extended : legacy,
  )
  if (error && isMissingRpc(error)) {
    ;({ error } = await client.rpc(
      'save_store_gift_options',
      preferExtended ? legacy : extended,
    ))
  }
  if (error) throw new Error(error.message)
}

/** The platform-controlled maximum gift options per purchase bracket. */
export async function fetchMaxGiftSelections(client: PlatformClient): Promise<number> {
  const { data, error } = await client
    .from('platform_policies')
    .select('value')
    .eq('key', 'max_gift_selections_per_bracket')
    .maybeSingle()
  if (error) throw new Error(error.message)
  const parsed = Number((data?.value as unknown) ?? 4)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4
}

/** Per-shop Google review link save (https enforced server-side + validated here). */
export async function saveStoreReviewLink(
  client: PlatformClient,
  storeId: string,
  url: string | null,
): Promise<void> {
  const trimmed = url?.trim() || null
  if (trimmed && !/^https:\/\/\S+$/i.test(trimmed)) {
    throw new Error('The Google review link must be an https:// URL.')
  }
  const { error } = await client
    .from('stores')
    .update({ google_review_url: trimmed })
    .eq('id', storeId)
  if (error) throw new Error(error.message)
}

/** Platform-controlled: may the shop owner edit the review link? */
export async function setStoreReviewPolicy(
  client: PlatformClient,
  storeId: string,
  ownerEditable: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_store_review_policy', {
    p_store_id: storeId,
    p_owner_editable: ownerEditable,
  })
  if (error) throw new Error(error.message)
}

/** Rename the shop slug (changes the customer URL; QR codes regenerate). */
export async function renameStoreSlug(
  client: PlatformClient,
  storeId: string,
  slug: string,
): Promise<void> {
  const { error } = await client.rpc('rename_store_slug', {
    p_store_id: storeId,
    p_new_slug: slug,
  })
  if (error) throw new Error(error.message)
}

export interface ShopBrandingPatch {
  name?: string
  subtitle?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  campaignBadge?: string | null
  minSpinAmount?: number
}

export async function updateShopBranding(
  client: PlatformClient,
  storeId: string,
  patch: ShopBrandingPatch,
): Promise<void> {
  const row: Database['public']['Tables']['stores']['Update'] = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.subtitle !== undefined) row.subtitle = patch.subtitle
  if (patch.primaryColor !== undefined) row.primary_color = patch.primaryColor
  if (patch.secondaryColor !== undefined) row.secondary_color = patch.secondaryColor
  if (patch.campaignBadge !== undefined) row.campaign_badge = patch.campaignBadge
  if (patch.minSpinAmount !== undefined) row.min_spin_amount = patch.minSpinAmount
  const { error } = await client.from('stores').update(row).eq('id', storeId)
  if (error) throw new Error(error.message)
}

/**
 * Replace an existing shop's logo: uploads to the same tenant-scoped storage
 * path the in-app uploader uses (store-logos/{storeId}/{uuid}.{ext}), then
 * persists stores.logo_url. The previous object is retained in storage.
 */
export async function updateShopLogo(
  client: PlatformClient,
  storeId: string,
  file: File,
): Promise<string> {
  const validation = validateLogoFile(file)
  if (!validation.ok) throw new Error(validation.error)
  const path = `${storeId}/${crypto.randomUUID()}.${validation.extension}`
  const { error } = await client.storage
    .from('store-logos')
    .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
  if (error) throw new Error(error.message)
  const url = client.storage.from('store-logos').getPublicUrl(path).data.publicUrl
  const { error: updateError } = await client
    .from('stores')
    .update({ logo_url: url })
    .eq('id', storeId)
  if (updateError) throw new Error(updateError.message)
  return url
}
