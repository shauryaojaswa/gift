import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GiftPoolPanel } from './GiftPoolPanel'
import type { CatalogGift, TierWithPool } from './api'

/**
 * Shop gift selection (4 gifts max per bracket) against the real component.
 * Server-side enforcement lives in save_store_gift_options and is tested in
 * scripts/staging-verify.mjs; these tests pin the UI contract: pre-selection of
 * persisted pools, the selection limit, save/reload persistence, and display
 * rules for inactive catalogue gifts.
 */

const mocks = vi.hoisted(() => ({
  client: { __stub: true },
  listTiersWithPools: vi.fn(),
  listCatalog: vi.fn(),
  saveGiftOptions: vi.fn(),
}))

// Mock by relative specifier: vi.mock resolves the path itself, and the
// '@/' alias (tsconfig paths) may not be applied at mock-registration time.
vi.mock('../../lib/data', () => ({ getSupabaseClient: () => mocks.client }))
vi.mock('./api', () => ({
  listTiersWithPools: mocks.listTiersWithPools,
  listCatalog: mocks.listCatalog,
  saveGiftOptions: mocks.saveGiftOptions,
}))

const gift = (id: string, name: string, active = true): CatalogGift => ({
  id,
  name,
  wheelLabel: name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
  description: null,
  imageUrl: null,
  voucherValue: null,
  claimCodePrefix: 'GIFT',
  validityText: null,
  active,
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
  { rewardId: 'r1', catalogGiftId: 'g1', giftName: 'Silver Coin' },
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

describe('GiftPoolPanel', () => {
  beforeEach(() => {
    mocks.listTiersWithPools.mockReset().mockResolvedValue([TIER_A, TIER_B])
    mocks.listCatalog.mockReset().mockResolvedValue(CATALOG)
    mocks.saveGiftOptions.mockReset().mockResolvedValue(undefined)
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
      expect(mocks.saveGiftOptions).toHaveBeenCalledWith(mocks.client, 'tier-a', [
        'g1',
        'g2',
      ]),
    )
    // save() reloads and then confirms
    await waitFor(() => expect(mocks.listTiersWithPools).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent(/Saved gift options/)
  })

  it('keeps selections per bracket independent', async () => {
    render(<GiftPoolPanel storeId="store-1" />)
    await waitFor(() => expect(checkboxFor('Silver Coin').checked).toBe(true))

    // Select in the second bracket only ("₹10,000 and above").
    fireEvent.click(checkboxIn('₹10,000 and above', 'Gold Coin'))
    expect(checkboxIn('₹1,000 – ₹10,000', 'Gold Coin').checked).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1])
    await waitFor(() =>
      expect(mocks.saveGiftOptions).toHaveBeenCalledWith(mocks.client, 'tier-b', ['g2']),
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
