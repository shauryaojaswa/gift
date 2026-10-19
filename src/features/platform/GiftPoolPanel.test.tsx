import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GiftPoolPanel } from './GiftPoolPanel'
import type { CatalogGift, TierWithPool } from './api'

/**
 * Shop gift selection (max per bracket from platform_policies) against the
 * real component. Server-side enforcement lives in save_store_gift_options
 * (count, price policy, availability, quantity bounds) and is tested against
 * the real database in scripts/backend-e2e.mjs; these tests pin the UI
 * contract: pre-selection of persisted pools, the selection limit, save/reload
 * persistence with declared values and quantities, the price-policy display,
 * per-shop availability, and display rules for inactive catalogue gifts.
 */

const mocks = vi.hoisted(() => ({
  client: { __stub: true },
  listTiersWithPools: vi.fn(),
  listCatalog: vi.fn(),
  saveGiftOptions: vi.fn(),
  fetchMaxGiftSelections: vi.fn(),
  updateCatalogGift: vi.fn(),
  fetchGiftSchemaSupport: vi.fn(),
}))

// Mock by relative specifier: vi.mock resolves the path itself, and the
// '@/' alias (tsconfig paths) may not be applied at mock-registration time.
vi.mock('../../lib/data', () => ({ getSupabaseClient: () => mocks.client }))
vi.mock('./api', () => ({
  listTiersWithPools: mocks.listTiersWithPools,
  listCatalog: mocks.listCatalog,
  saveGiftOptions: mocks.saveGiftOptions,
  fetchMaxGiftSelections: mocks.fetchMaxGiftSelections,
  updateCatalogGift: mocks.updateCatalogGift,
  fetchGiftSchemaSupport: mocks.fetchGiftSchemaSupport,
}))

/** Every optional gift-option extension present (current schema generation). */
const FULL_SUPPORT = {
  declaredValues: true,
  stock: true,
  pricePolicy: true,
  availability: true,
}
/** Production's deployed schema: none of the optional extensions exist. */
const LEGACY_SUPPORT = {
  declaredValues: false,
  stock: false,
  pricePolicy: false,
  availability: false,
}

const gift = (
  id: string,
  name: string,
  active = true,
  extra: Partial<CatalogGift> = {},
): CatalogGift => ({
  id,
  name,
  wheelLabel: name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
  description: null,
  imageUrl: null,
  voucherValue: null,
  valueMin: null,
  valueMax: null,
  excludedStoreIds: [],
  claimCodePrefix: 'GIFT',
  validityText: null,
  active,
  ...extra,
})

const tier = (id: string, min: number, max: number | null, pool: TierWithPool['pool']): TierWithPool => ({
  id,
  minAmount: min,
  maxAmount: max,
  targetSegment: 0,
  active: true,
  rewardId: null,
  rewardName: null,
  pool,
})

const CATALOG = [
  gift('g1', 'Silver Coin'),
  gift('g2', 'Gold Coin'),
  gift('g3', 'Cleaning Kit'),
  gift('g4', 'Gift Voucher'),
  gift('g5', 'Diamond Pendant'),
  gift('g6', 'Retired Gift', false),
]

const TIER_A = tier('tier-a', 1000, 10000, [
  {
    rewardId: 'r1',
    catalogGiftId: 'g1',
    giftName: 'Silver Coin',
    declaredValue: null,
    quantity: null,
    quantityClaimed: 0,
  },
])
const TIER_B = tier('tier-b', 10000, null, [])

function checkboxFor(name: string): HTMLInputElement {
  const label = Array.from(document.querySelectorAll('label')).find((el) =>
    (el.textContent ?? '').includes(name),
  )
  expect(label, `label for ${name} must exist`).toBeTruthy()
  return label!.querySelector('input[type="checkbox"]')!
}

/** Scope a gift checkbox to one bracket card (the same catalogue renders per bracket). */
function checkboxIn(bracketHeading: string, name: string): HTMLInputElement {
  const card = screen.getByText(bracketHeading).closest('.rounded-xl')
  expect(card, `bracket card ${bracketHeading} must exist`).toBeTruthy()
  const label = Array.from(card!.querySelectorAll('label')).find((el) =>
    (el.textContent ?? '').includes(name),
  )
  expect(label, `label for ${name} in ${bracketHeading} must exist`).toBeTruthy()
  return label!.querySelector('input[type="checkbox"]')!
}

/** The visible input labelled for a gift inside one bracket card. */
function labelledInputIn(bracketHeading: string, labelPattern: RegExp, name: string): HTMLInputElement {
  const card = screen.getByText(bracketHeading).closest('.rounded-xl')!
  const input = Array.from(card.querySelectorAll('input')).find((el) => {
    const label = el.getAttribute('aria-label') ?? ''
    return label.includes(name) && labelPattern.test(label)
  })
  expect(input, `input ${labelPattern} for ${name} in ${bracketHeading} must exist`).toBeTruthy()
  return input as HTMLInputElement
}

describe('GiftPoolPanel', () => {
  beforeEach(() => {
    mocks.listTiersWithPools.mockReset().mockResolvedValue([TIER_A, TIER_B])
    mocks.listCatalog.mockReset().mockResolvedValue(CATALOG)
    mocks.saveGiftOptions.mockReset().mockResolvedValue(undefined)
    mocks.fetchMaxGiftSelections.mockReset().mockResolvedValue(4)
    mocks.updateCatalogGift.mockReset().mockResolvedValue(undefined)
    mocks.fetchGiftSchemaSupport.mockReset().mockResolvedValue(FULL_SUPPORT)
  })

  it('loads brackets and pre-selects the persisted pool', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))
    expect(mocks.listTiersWithPools).toHaveBeenCalledWith(mocks.client, 'store-1')
    expect(mocks.listCatalog).toHaveBeenCalledWith(mocks.client, true)
    expect(checkboxFor('Gold Coin').checked).toBe(false)
    // Persisted selection count is shown
    expect(screen.getByText(/1 of 4 gifts selected/)).toBeInTheDocument()
  })

  it('takes the selection limit from platform policy, not a hardcode', async () => {
    mocks.fetchMaxGiftSelections.mockResolvedValue(2)
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    expect(screen.getByText(/up to 2 catalogue gifts/)).toBeInTheDocument()
    fireEvent.click(checkboxFor('Gold Coin'))
    fireEvent.click(checkboxFor('Cleaning Kit')) // 3rd -> over the policy limit
    expect(checkboxFor('Cleaning Kit').checked).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent(/at most 2 gifts/i)
  })

  it('allows selecting up to four gifts in a bracket', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Gold Coin'))
    fireEvent.click(checkboxFor('Cleaning Kit'))
    fireEvent.click(checkboxFor('Gift Voucher'))
    expect(checkboxFor('Gold Coin').checked).toBe(true)
    expect(checkboxFor('Cleaning Kit').checked).toBe(true)
    expect(checkboxFor('Gift Voucher').checked).toBe(true)
  })

  it('rejects a fifth gift with a visible notice and leaves it unselected', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Gold Coin'))
    fireEvent.click(checkboxFor('Cleaning Kit'))
    fireEvent.click(checkboxFor('Gift Voucher'))
    fireEvent.click(checkboxFor('Diamond Pendant')) // 5th for tier-a

    expect(checkboxFor('Diamond Pendant').checked).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent(/at most 4 gifts/i)
  })

  it('frees a slot when a gift is deselected', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Gold Coin'))
    fireEvent.click(checkboxFor('Cleaning Kit'))
    fireEvent.click(checkboxFor('Gift Voucher'))
    fireEvent.click(checkboxFor('Silver Coin')) // deselect persisted gift
    expect(checkboxFor('Silver Coin').checked).toBe(false)

    fireEvent.click(checkboxFor('Diamond Pendant')) // now fits
    expect(checkboxFor('Diamond Pendant').checked).toBe(true)
  })

  it('saves exactly the selection for its bracket and reloads persistence', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Gold Coin'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() =>
      expect(mocks.saveGiftOptions).toHaveBeenCalledWith(
        mocks.client,
        'tier-a',
        ['g1', 'g2'],
        { g1: null, g2: null },
        { g1: null, g2: null },
      ),
    )
    // save() reloads and then confirms
    await waitFor(() => expect(mocks.listTiersWithPools).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent(/Saved gift options/)
  })

  it('sends declared values and quantities typed for a selected gift', async () => {
    mocks.listCatalog.mockResolvedValue([
      ...CATALOG,
      gift('g7', 'Adjustable Coin', true, { valueMin: 1500, valueMax: 5000, voucherValue: 2500 }),
    ])
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Adjustable Coin'))
    // price policy is displayed for the gift type
    expect(screen.getAllByText(/Value policy: ₹1,500 – ₹5,000/).length).toBeGreaterThan(0)

    fireEvent.change(
      labelledInputIn('₹1,000 – ₹10,000', /Declared value/, 'Adjustable Coin'),
      { target: { value: '2200' } },
    )
    fireEvent.change(
      labelledInputIn('₹1,000 – ₹10,000', /Quantity/, 'Adjustable Coin'),
      { target: { value: '25' } },
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() =>
      expect(mocks.saveGiftOptions).toHaveBeenCalledWith(
        mocks.client,
        'tier-a',
        ['g1', 'g7'],
        { g1: null, g7: 2200 },
        { g1: null, g7: 25 },
      ),
    )
  })

  it('disables gifts that are not available to this shop', async () => {
    mocks.listCatalog.mockResolvedValue([
      gift('g1', 'Silver Coin'),
      gift('g8', 'Restricted Gift', true, { excludedStoreIds: ['store-1'] }),
    ])
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    expect(screen.getAllByText(/not available for this shop/)).toHaveLength(2)
    expect(checkboxFor('Restricted Gift').disabled).toBe(true)
  })

  it('lets the platform toggle availability for the shop', async () => {
    mocks.listCatalog.mockResolvedValue([
      gift('g8', 'Restricted Gift', true, { excludedStoreIds: ['store-1'] }),
    ])
    render(<GiftPoolPanel storeId="store-1" canManageAvailability />)
    await waitFor(() => expect(screen.getAllByText(/Restricted Gift/).length).toBeGreaterThan(0))

    fireEvent.click(screen.getAllByRole('button', { name: 'Allow for this shop' })[0])
    await waitFor(() =>
      expect(mocks.updateCatalogGift).toHaveBeenCalledWith(mocks.client, 'g8', {
        excludedStoreIds: [],
      }),
    )
  })

  it('keeps selections per bracket independent', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    // Select in the second bracket only ("₹10,000 and above").
    fireEvent.click(checkboxIn('₹10,000 and above', 'Gold Coin'))
    expect(checkboxIn('₹1,000 – ₹10,000', 'Gold Coin').checked).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1])
    await waitFor(() =>
      expect(mocks.saveGiftOptions).toHaveBeenCalledWith(
        mocks.client,
        'tier-b',
        ['g2'],
        { g2: null },
        { g2: null },
      ),
    )
  })

  it('hides inactive catalogue gifts unless they are already in the pool', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))
    // g6 'Retired Gift' is inactive and not selected -> hidden in every bracket
    expect(screen.queryByText(/Retired Gift/)).toBeNull()
    // active gifts are visible in both bracket cards
    expect(screen.getAllByText(/Diamond Pendant/)).toHaveLength(2)
  })

  it('shows a helpful message when the catalogue is empty', async () => {
    mocks.listCatalog.mockResolvedValue([])
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() =>
      // one message per bracket card (2 brackets in the fixture)
      expect(screen.getAllByText(/No catalogue gifts yet/)).toHaveLength(2),
    )
  })

  it('surfaces API errors instead of failing silently', async () => {
    mocks.saveGiftOptions.mockRejectedValue(new Error('permission denied'))
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('permission denied'),
    )
  })
})

/**
 * Older schema generation (production today): no declared values, no stock,
 * no price policy, no per-shop availability columns. The panel must stay fully
 * usable — brackets load, selections save — while controls whose backing
 * columns do not exist are not offered at all instead of silently dropping
 * typed input.
 */
describe('GiftPoolPanel on an older schema (no gift-option extensions)', () => {
  beforeEach(() => {
    mocks.listTiersWithPools.mockReset().mockResolvedValue([TIER_A, TIER_B])
    mocks.listCatalog.mockReset().mockResolvedValue(CATALOG)
    mocks.saveGiftOptions.mockReset().mockResolvedValue(undefined)
    mocks.fetchMaxGiftSelections.mockReset().mockResolvedValue(4)
    mocks.updateCatalogGift.mockReset().mockResolvedValue(undefined)
    mocks.fetchGiftSchemaSupport.mockReset().mockResolvedValue(LEGACY_SUPPORT)
  })

  it('loads brackets and saves selections without the extended columns', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Gold Coin'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await waitFor(() =>
      expect(mocks.saveGiftOptions).toHaveBeenCalledWith(
        mocks.client,
        'tier-a',
        ['g1', 'g2'],
        { g1: null, g2: null },
        { g1: null, g2: null },
      ),
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Saved gift options/))
  })

  it('never offers the quantity field when stock columns do not exist', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Gold Coin'))
    expect(screen.queryByLabelText(/Quantity for Silver Coin/)).toBeNull()
    expect(screen.queryByLabelText(/Quantity for Gold Coin/)).toBeNull()
  })

  it('shows declared values as fixed (disabled) when there is no price policy', async () => {
    mocks.listCatalog.mockResolvedValue([
      ...CATALOG,
      gift('g7', 'Adjustable Coin', true, { valueMin: null, valueMax: null, voucherValue: 2500 }),
    ])
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    fireEvent.click(checkboxFor('Adjustable Coin'))
    const declared = labelledInputIn('₹1,000 – ₹10,000', /Declared value/, 'Adjustable Coin')
    expect(declared.disabled).toBe(true)
    expect(screen.getAllByText(/Value: ₹2,500 \(fixed by platform\)/).length).toBeGreaterThan(0)
  })

  it('hides the per-shop availability toggle when the column does not exist', async () => {
    mocks.listCatalog.mockResolvedValue([
      gift('g8', 'Restricted Gift', true, { excludedStoreIds: ['store-1'] }),
    ])
    render(<GiftPoolPanel storeId="store-1" canManageAvailability />)
    await waitFor(() => expect(screen.getAllByText(/Restricted Gift/).length).toBeGreaterThan(0))

    expect(screen.queryByRole('button', { name: 'Allow for this shop' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Disallow for this shop' })).toBeNull()
  })
})
