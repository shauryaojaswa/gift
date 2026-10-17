import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import Rewards from './Rewards'
import { useAdminStore } from '../admin/useAdminStore'
import type { DataProvider } from '../../lib/data/types'

// Regression: the owner Campaign editor must create rewards and purchase
// tiers with valid uuid ids. `rewards.id` and `reward_tiers.id` are uuid
// columns, and submissions.reward_id is a uuid too - an id like
// "reward_ab12cd34" made every owner-side save fail against the real backend
// (invalid input syntax for type uuid), leaving shops unable to configure
// their own prizes. The platform editors (RewardsPage/TiersPage) already
// generated bare uuids; the vendor editor now matches.
vi.mock('../admin/useAdminStore')
vi.mock('../../platform/GiftPoolPanel', () => ({ GiftPoolPanel: () => null }))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mockStore(overrides: {
  rewards?: Array<Record<string, unknown>>
  tiers?: Array<Record<string, unknown>>
  provider?: Partial<DataProvider>
}) {
  const dataProvider = {
    upsertReward: vi.fn(async (r) => r),
    upsertTier: vi.fn(async (t) => t),
    deleteReward: vi.fn(async () => undefined),
    deleteTier: vi.fn(async () => undefined),
    ...overrides.provider,
  } as unknown as DataProvider
  vi.mocked(useAdminStore).mockReturnValue({
    store: { rewards: overrides.rewards ?? [], tiers: overrides.tiers ?? [] },
    loading: false,
    dataProvider,
    reload: vi.fn(),
  } as unknown as ReturnType<typeof useAdminStore>)
  return dataProvider
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('vendor Rewards editor', () => {
  it('creates a reward with a valid uuid id', async () => {
    const provider = mockStore({})

    const { container, getByRole } = render(<Rewards />)
    fireEvent.click(getByRole('button', { name: 'Add reward' }))

    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: 'Test Gift' } })
    fireEvent.change(inputs[1], { target: { value: 'TST' } })
    fireEvent.click(getByRole('button', { name: 'Save reward' }))

    await waitFor(() => expect(provider.upsertReward).toHaveBeenCalledTimes(1))
    const saved = vi.mocked(provider.upsertReward).mock.calls[0][0]
    expect(saved.name).toBe('Test Gift')
    expect(saved.id).toMatch(UUID_RE)
  })

  it('creates a purchase tier with a valid uuid id', async () => {
    const rewardId = crypto.randomUUID()
    const provider = mockStore({
      rewards: [
        {
          id: rewardId,
          name: 'Existing Gift',
          description: '',
          claimCodePrefix: 'EXI',
          validityText: '',
          active: true,
        },
      ],
    })

    const { container, getByRole } = render(<Rewards />)
    fireEvent.click(getByRole('button', { name: 'Add tier' }))

    const numbers = container.querySelectorAll('input[type="number"]')
    fireEvent.change(numbers[0], { target: { value: '1000' } })
    fireEvent.change(numbers[1], { target: { value: '4999' } })
    fireEvent.change(container.querySelector('select')!, { target: { value: rewardId } })
    fireEvent.click(getByRole('button', { name: 'Save tier' }))

    await waitFor(() => expect(provider.upsertTier).toHaveBeenCalledTimes(1))
    const saved = vi.mocked(provider.upsertTier).mock.calls[0][0]
    expect(saved.id).toMatch(UUID_RE)
    expect(saved.minAmount).toBe(1000)
    expect(saved.maxAmount).toBe(4999)
    expect(saved.rewardId).toBe(rewardId)
  })

  it('re-saving an existing reward keeps its id', async () => {
    const rewardId = crypto.randomUUID()
    const provider = mockStore({
      rewards: [
        {
          id: rewardId,
          name: 'Existing Gift',
          description: '',
          claimCodePrefix: 'EXI',
          validityText: '',
          active: true,
        },
      ],
    })

    const { getByRole } = render(<Rewards />)
    fireEvent.click(getByRole('button', { name: 'Edit' }))
    fireEvent.click(getByRole('button', { name: 'Save reward' }))

    await waitFor(() => expect(provider.upsertReward).toHaveBeenCalledTimes(1))
    expect(vi.mocked(provider.upsertReward).mock.calls[0][0].id).toBe(rewardId)
  })
})
