import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDataProvider } from './local'
import { JOLLY_ENTERPRISES_SLUG } from '../stores'
import type { CreateSubmissionInput } from './types'

const requestId = 'fd919395-124c-4b18-89ec-5d91a1f4108e'

function createInput(overrides: Partial<CreateSubmissionInput> = {}): CreateSubmissionInput {
  return {
    storeSlug: JOLLY_ENTERPRISES_SLUG,
    requestId,
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    purchaseAmount: 125000,
    reviewCtaShown: true,
    reviewCtaClicked: false,
    ...overrides,
  }
}

describe('LocalDataProvider customer entries', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('assigns the active tier deterministically and keeps retries idempotent', async () => {
    const provider = new LocalDataProvider()
    const first = await provider.createSubmission(createInput())
    const changedStore = await provider.getStoreConfig(JOLLY_ENTERPRISES_SLUG)
    if (!changedStore) throw new Error('Expected demo store')
    changedStore.rewards[4].name = 'A changed reward'
    changedStore.rewards[4].active = false
    changedStore.tiers[4].targetSegment = 7
    await provider.updateStore({ rewards: changedStore.rewards, tiers: changedStore.tiers })

    const retry = await provider.createSubmission(createInput())
    expect(first.id).toBe(requestId)
    expect(retry).toEqual(first)
    const list = await provider.listSubmissions({ page: 1, pageSize: 20, search: '' })
    expect(list.total).toBe(1)
    expect(list.items[0].rewardLabel).toBe('₹1,000 Making-Charge Voucher')
    expect(list.items[0].targetSegment).toBe(4)
    expect(list.items[0].collectionStatus).toBe('awaiting')
  })

  it('rejects a reused entry reference with different customer details', async () => {
    const provider = new LocalDataProvider()
    await provider.createSubmission(createInput())
    await expect(provider.createSubmission(createInput({ customerName: 'Different Customer' })))
      .rejects.toThrow('This entry reference has already been used')
  })

  it('marks a gift collected once and rejects duplicate collection', async () => {
    const provider = new LocalDataProvider()
    const entry = await provider.createSubmission(createInput())
    await provider.markSubmissionCollected(entry.id)
    await expect(provider.markSubmissionCollected(entry.id)).rejects.toThrow('Gift has already been collected')
    const result = await provider.listSubmissions({ page: 1, pageSize: 20, search: '' })
    expect(result.items[0].collectionStatus).toBe('collected')
    expect(result.items[0].collectedAt).toBeTruthy()
  })

  it('rejects purchases that do not map to one configured active reward', async () => {
    const provider = new LocalDataProvider()
    await expect(provider.createSubmission(createInput({ purchaseAmount: 9999 })))
      .rejects.toThrow('Purchase does not qualify for an active reward')
  })

  it('persists optional invoice details with the entry and stores none when absent', async () => {
    const provider = new LocalDataProvider()
    await provider.createSubmission(createInput({ invoiceDetails: 'INV-2026-00123' }))
    await provider.createSubmission(createInput({ requestId: 'fd919395-124c-4b18-89ec-5d91a1f4108f' }))

    // A fresh provider instance reads back from storage: nothing is kept in
    // transient browser state only.
    const reopened = new LocalDataProvider()
    const list = await reopened.listSubmissions({ page: 1, pageSize: 20, search: '' })
    expect(list.total).toBe(2)
    const withInvoice = list.items.find((r) => r.id === requestId)
    const withoutInvoice = list.items.find((r) => r.id === 'fd919395-124c-4b18-89ec-5d91a1f4108f')
    expect(withInvoice?.invoiceDetails).toBe('INV-2026-00123')
    expect(withoutInvoice?.invoiceDetails ?? null).toBeNull()
    expect(withoutInvoice?.collectionStatus).toBe('awaiting')
  })
})
