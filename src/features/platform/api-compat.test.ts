import { describe, expect, it, vi } from 'vitest'
import {
  createCatalogGift,
  fetchGiftSchemaSupport,
  listCatalog,
  listTiersWithPools,
  saveGiftOptions,
  updateCatalogGift,
  type PlatformClient,
} from './api'

/**
 * Backward compatibility with the deployed production schema.
 *
 * Production predates the gift price-policy / stock chain: it has neither
 * `gift_catalog.value_min|value_max|excluded_store_ids` nor
 * `tier_gift_options.declared_value|quantity|quantity_claimed`, and only the
 * 2-argument `save_store_gift_options(p_tier_id, p_catalog_gift_ids)`. The
 * newer frontend surfaces must keep working there — brackets must load
 * (a select of the missing columns is rejected with 42703 and would leave the
 * Rewards & Tiers page stuck), gift-option saves must reach the deployed RPC
 * (the 4-argument call fails with PGRST202), and no write may send columns the
 * backend does not have. None of this touches reward behaviour: it is purely
 * about which shape is spoken to which schema generation.
 */

type AnyObj = Record<string, unknown>

interface FakeConfig {
  /** Map of 'table.column' to whether the column exists. */
  columns: Record<string, boolean>
  tiers?: unknown[]
  catalog?: unknown[]
  /** Per-call rpc results, consumed in order; default success. */
  rpcQueue?: Array<{ data?: unknown; error: { code?: string; message: string } | null }>
}

/**
 * Minimal chainable stand-in for the supabase client: records the exact query
 * shapes and returns results driven by `columns`, `tiers`, `catalog`, `rpcQueue`.
 */
function makeCompatClient(config: FakeConfig) {
  const selects: Array<{ table: string; columns: string }> = []
  const inserts: Array<{ table: string; row: AnyObj }> = []
  const updates: Array<{ table: string; patch: AnyObj }> = []
  const rpcs: Array<{ fn: string; args: AnyObj }> = []
  let rpcCall = 0

  const missingColumnError = (table: string, column: string) => ({
    data: null,
    error: {
      code: '42703',
      message: `column ${table}_1.${column} does not exist`,
    },
  })

  function from(table: string) {
    const respond = (columns: string) => {
      // Probe calls (single optional column) answer with existence.
      if (columns !== '*' && !columns.includes(',')) {
        const exists = config.columns[`${table}.${columns}`] ?? false
        return exists
          ? { data: [], error: null }
          : missingColumnError(table, columns)
      }
      if (table === 'reward_tiers') return { data: config.tiers ?? [], error: null }
      return { data: config.catalog ?? [], error: null }
    }

    // State is per builder (probes run concurrently and must not share it).
    let mode: 'select' | 'write' = 'select'
    let columns = '*'
    const builder: AnyObj = {}
    const chain = () => builder
    builder.select = (cols?: string) => {
      mode = 'select'
      columns = cols ?? '*'
      selects.push({ table, columns })
      return builder
    }
    builder.insert = (row: AnyObj) => {
      mode = 'write'
      inserts.push({ table, row })
      return builder
    }
    builder.update = (patch: AnyObj) => {
      mode = 'write'
      updates.push({ table, patch })
      return builder
    }
    builder.eq = chain
    builder.order = chain
    builder.limit = chain
    builder.single = () => Promise.resolve({ data: { id: 'gift-new' }, error: null })
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const result = mode === 'select' ? respond(columns) : { data: null, error: null }
      return Promise.resolve(result).then(resolve, reject)
    }
    return builder
  }

  const rpc = vi.fn(async (fn: string, args: AnyObj) => {
    rpcs.push({ fn, args })
    const result = config.rpcQueue?.[rpcCall]
    rpcCall += 1
    return result ?? { data: null, error: null }
  })

  const client = { from, rpc } as unknown as PlatformClient
  return { client, selects, inserts, updates, rpcs, rpc }
}

const LEGACY_COLUMNS = {
  'tier_gift_options.declared_value': false,
  'tier_gift_options.quantity': false,
  'gift_catalog.value_min': false,
  'gift_catalog.excluded_store_ids': false,
}

const FULL_COLUMNS = {
  'tier_gift_options.declared_value': true,
  'tier_gift_options.quantity': true,
  'gift_catalog.value_min': true,
  'gift_catalog.excluded_store_ids': true,
}

const TIER_ROWS = [
  {
    id: 't1',
    min_amount: 1000,
    max_amount: 10000,
    target_segment: 0,
    active: true,
    reward_id: null,
    rewards: { name: 'Pool rewards' },
    tier_gift_options: [
      {
        reward_id: 'r1',
        active: true,
        rewards: { name: 'Silver Coin', catalog_gift_id: 'g1' },
      },
    ],
  },
]

describe('fetchGiftSchemaSupport', () => {
  it('reports every optional extension missing on the production schema', async () => {
    const { client, selects } = makeCompatClient({ columns: LEGACY_COLUMNS })
    await expect(fetchGiftSchemaSupport(client)).resolves.toEqual({
      declaredValues: false,
      stock: false,
      pricePolicy: false,
      availability: false,
    })
    // One probe per optional column, no more.
    expect(selects).toHaveLength(4)
  })

  it('reports the extensions present and probes once per client', async () => {
    const { client, selects } = makeCompatClient({ columns: FULL_COLUMNS })
    const first = await fetchGiftSchemaSupport(client)
    const second = await fetchGiftSchemaSupport(client)
    expect(first).toEqual({
      declaredValues: true,
      stock: true,
      pricePolicy: true,
      availability: true,
    })
    expect(second).toBe(first)
    expect(selects).toHaveLength(4)
  })
})

describe('listTiersWithPools across schema generations', () => {
  it('selects only existing columns on the older schema and normalises the pool', async () => {
    const { client, selects } = makeCompatClient({
      columns: LEGACY_COLUMNS,
      tiers: TIER_ROWS,
    })
    const tiers = await listTiersWithPools(client, 'store-1')
    const optionSelect = selects.find((s) => s.table === 'reward_tiers')!
    // The rejected select (42703) is never sent: no extended columns at all.
    expect(optionSelect.columns).toContain('tier_gift_options(reward_id, active,')
    expect(optionSelect.columns).not.toContain('declared_value')
    expect(optionSelect.columns).not.toContain('quantity')
    // Absent columns normalise to "catalogue value, unlimited, nothing issued".
    expect(tiers[0].pool).toEqual([
      {
        rewardId: 'r1',
        catalogGiftId: 'g1',
        giftName: 'Silver Coin',
        declaredValue: null,
        quantity: null,
        quantityClaimed: 0,
      },
    ])
  })

  it('selects the extended columns and maps them through on the newer schema', async () => {
    const { client, selects } = makeCompatClient({
      columns: FULL_COLUMNS,
      tiers: [
        {
          ...TIER_ROWS[0],
          tier_gift_options: [
            {
              reward_id: 'r1',
              declared_value: 2500,
              quantity: 10,
              quantity_claimed: 3,
              active: true,
              rewards: { name: 'Silver Coin', catalog_gift_id: 'g1' },
            },
            {
              reward_id: 'r2',
              declared_value: null,
              quantity: null,
              quantity_claimed: 0,
              active: false,
              rewards: { name: 'Retired', catalog_gift_id: 'g2' },
            },
          ],
        },
      ],
    })
    const tiers = await listTiersWithPools(client, 'store-1')
    const optionSelect = selects.find((s) => s.table === 'reward_tiers')!
    expect(optionSelect.columns).toContain('declared_value')
    expect(optionSelect.columns).toContain('quantity, quantity_claimed')
    // Only active options are part of the editable pool.
    expect(tiers[0].pool).toEqual([
      {
        rewardId: 'r1',
        catalogGiftId: 'g1',
        giftName: 'Silver Coin',
        declaredValue: 2500,
        quantity: 10,
        quantityClaimed: 3,
      },
    ])
  })
})

describe('saveGiftOptions across schema generations', () => {
  it('calls the deployed 2-argument RPC shape on the older schema', async () => {
    const { client, rpcs } = makeCompatClient({ columns: LEGACY_COLUMNS })
    await saveGiftOptions(client, 't1', ['g1', 'g2'], { g1: 2200 }, { g1: 5 })
    expect(rpcs).toHaveLength(1)
    expect(rpcs[0]).toEqual({
      fn: 'save_store_gift_options',
      args: { p_tier_id: 't1', p_catalog_gift_ids: ['g1', 'g2'] },
    })
  })

  it('sends declared values and quantities to the 4-argument RPC on the newer schema', async () => {
    const { client, rpcs } = makeCompatClient({ columns: FULL_COLUMNS })
    await saveGiftOptions(client, 't1', ['g1'], { g1: 2200 }, { g1: 5 })
    expect(rpcs).toHaveLength(1)
    expect(rpcs[0]).toEqual({
      fn: 'save_store_gift_options',
      args: {
        p_tier_id: 't1',
        p_catalog_gift_ids: ['g1'],
        p_declared_values: { g1: 2200 },
        p_quantities: { g1: 5 },
      },
    })
  })

  it('sends blank entries as omission, never as JSON null (server rejects null values)', async () => {
    const { client, rpcs } = makeCompatClient({ columns: FULL_COLUMNS })
    // Blank = "catalogue default / unlimited": the server validates every map
    // entry as a whole number ("A gift value must be a whole number") and an
    // omitted key resets the stored override on upsert.
    await saveGiftOptions(client, 't1', ['g1', 'g2'], { g1: null, g2: 2200 }, { g1: 5, g2: null })
    expect(rpcs[0].args).toEqual({
      p_tier_id: 't1',
      p_catalog_gift_ids: ['g1', 'g2'],
      p_declared_values: { g2: 2200 },
      p_quantities: { g1: 5 },
    })
  })

  it('travels all-blank maps as null (every value reset to default)', async () => {
    const { client, rpcs } = makeCompatClient({ columns: FULL_COLUMNS })
    await saveGiftOptions(client, 't1', ['g1'], { g1: null }, { g1: null })
    expect(rpcs[0].args).toEqual({
      p_tier_id: 't1',
      p_catalog_gift_ids: ['g1'],
      p_declared_values: null,
      p_quantities: null,
    })
  })

  it('retries the 2-argument shape when the 4-argument call does not exist (PGRST202)', async () => {
    const { client, rpcs } = makeCompatClient({
      columns: FULL_COLUMNS,
      rpcQueue: [
        {
          error: {
            code: 'PGRST202',
            message:
              'Could not find the function public.save_store_gift_options(p_catalog_gift_ids, p_declared_values, p_quantities, p_tier_id)',
          },
        },
      ],
    })
    await saveGiftOptions(client, 't1', ['g1'], { g1: 2200 }, { g1: 5 })
    expect(rpcs).toHaveLength(2)
    expect(rpcs[1].args).toEqual({ p_tier_id: 't1', p_catalog_gift_ids: ['g1'] })
  })

  it('surfaces real server verdicts verbatim instead of retrying around them', async () => {
    const { client, rpcs } = makeCompatClient({
      columns: FULL_COLUMNS,
      rpcQueue: [
        { error: { message: 'Gift value is outside the platform price policy' } },
      ],
    })
    await expect(
      saveGiftOptions(client, 't1', ['g1'], { g1: 2200 }, null),
    ).rejects.toThrow(/outside the platform price policy/)
    // A validation verdict is never retried into a weaker call shape.
    expect(rpcs).toHaveLength(1)
  })
})

describe('catalogue writes across schema generations', () => {
  const input = {
    name: 'Silver Coin',
    wheelLabel: 'SILVER',
    description: null,
    imageUrl: null,
    voucherValue: 2500,
    valueMin: 1500,
    valueMax: 5000,
    excludedStoreIds: ['store-1'],
    claimCodePrefix: 'GIFT',
    validityText: null,
    active: true,
  }

  it('omits the optional columns on create when the schema lacks them', async () => {
    const { client, inserts } = makeCompatClient({ columns: LEGACY_COLUMNS })
    await createCatalogGift(client, input)
    const row = inserts[0].row
    expect(row).not.toHaveProperty('value_min')
    expect(row).not.toHaveProperty('value_max')
    expect(row).not.toHaveProperty('excluded_store_ids')
    expect(row).toMatchObject({ name: 'Silver Coin', voucher_value: 2500 })
  })

  it('writes the optional columns on create when the schema has them', async () => {
    const { client, inserts } = makeCompatClient({ columns: FULL_COLUMNS })
    await createCatalogGift(client, input)
    expect(inserts[0].row).toMatchObject({
      value_min: 1500,
      value_max: 5000,
      excluded_store_ids: ['store-1'],
    })
  })

  it('keeps the optional columns out of update patches on the older schema', async () => {
    const { client, updates } = makeCompatClient({ columns: LEGACY_COLUMNS })
    await updateCatalogGift(client, 'g1', {
      valueMin: 1500,
      valueMax: 5000,
      excludedStoreIds: [],
      active: false,
    })
    expect(updates[0].patch).toEqual({ active: false })
  })

  it('patches the optional columns on the newer schema', async () => {
    const { client, updates } = makeCompatClient({ columns: FULL_COLUMNS })
    await updateCatalogGift(client, 'g1', {
      valueMin: 1500,
      excludedStoreIds: [],
    })
    expect(updates[0].patch).toEqual({ value_min: 1500, excluded_store_ids: [] })
  })

  it('normalises absent value columns to null when reading the catalogue', async () => {
    const { client } = makeCompatClient({
      columns: LEGACY_COLUMNS,
      catalog: [
        {
          id: 'g1',
          name: 'Silver Coin',
          wheel_label: 'SILVER',
          description: null,
          image_url: null,
          voucher_value: 2500,
          claim_code_prefix: 'GIFT',
          validity_text: null,
          active: true,
        },
      ],
    })
    const gifts = await listCatalog(client, true)
    // A fixed-value gift on an older schema must not look "adjustable".
    expect(gifts[0].valueMin).toBeNull()
    expect(gifts[0].valueMax).toBeNull()
    expect(gifts[0].excludedStoreIds).toEqual([])
  })
})
