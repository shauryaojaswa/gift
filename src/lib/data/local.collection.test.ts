import { describe, it, expect, beforeEach } from 'vitest'
import { LocalDataProvider } from './local'
import { JOLLY_ENTERPRISES } from '../stores'

// Gift-collection tracking (client dashboard "mark collected").
// Uses the browser-backed LocalDataProvider; happy-dom provides window.localStorage.

function newProvider(): LocalDataProvider {
  return new LocalDataProvider()
}

async function seedSubmission(provider: LocalDataProvider) {
  const res = await provider.createSubmission({
    storeId: JOLLY_ENTERPRISES.id,
    storeName: JOLLY_ENTERPRISES.name,
    customerName: 'Asha Rao',
    customerPhone: '9876543210',
    purchaseAmount: 125000,
    reward: JOLLY_ENTERPRISES.rewards[4], // ₹1,000 VOUCHER
    tier: JOLLY_ENTERPRISES.tiers[4],
    reviewCtaShown: false,
    reviewCtaClicked: false,
  })
  return res.id
}

describe('gift-collection tracking', () => {
  let provider: LocalDataProvider

  beforeEach(() => {
    window.localStorage.clear()
    provider = newProvider()
  })

  it('creates every submission in the "awaiting" collection state', async () => {
    const id = await seedSubmission(provider)
    const list = await provider.listSubmissions({ page: 1, pageSize: 20, search: '' })
    expect(list.items).toHaveLength(1)
    expect(list.items[0].id).toBe(id)
    expect(list.items[0].collection).toEqual({
      status: 'awaiting',
      collectedAt: null,
      collectedBy: null,
    })
  })

  it('marks a gift collected and records the timestamp and staff identity', async () => {
    const id = await seedSubmission(provider)
    const updated = await provider.setCollectionStatus(id, 'collected', { collectedBy: 'owner@shop.test' })
    expect(updated.collection.status).toBe('collected')
    expect(updated.collection.collectedBy).toBe('owner@shop.test')
    expect(updated.collection.collectedAt).not.toBeNull()
    expect(Number.isNaN(Date.parse(updated.collection.collectedAt as string))).toBe(false)
  })

  it('is idempotent: re-marking collected does not overwrite the original record', async () => {
    const id = await seedSubmission(provider)
    const first = await provider.setCollectionStatus(id, 'collected', { collectedBy: 'owner@shop.test' })
    const second = await provider.setCollectionStatus(id, 'collected', { collectedBy: 'someone-else@shop.test' })
    // Prevent accidental duplicate collection operations from rewriting history.
    expect(second.collection.collectedAt).toBe(first.collection.collectedAt)
    expect(second.collection.collectedBy).toBe('owner@shop.test')
  })

  it('can revert a collection back to awaiting and clears the record', async () => {
    const id = await seedSubmission(provider)
    await provider.setCollectionStatus(id, 'collected', { collectedBy: 'owner@shop.test' })
    const reverted = await provider.setCollectionStatus(id, 'awaiting')
    expect(reverted.collection).toEqual({ status: 'awaiting', collectedAt: null, collectedBy: null })
  })

  it('throws when marking an unknown submission', async () => {
    await expect(provider.setCollectionStatus('does_not_exist', 'collected')).rejects.toThrow(
      /Submission not found/,
    )
  })

  it('aggregates awaiting/collected counts in stats', async () => {
    const id1 = await seedSubmission(provider)
    const id2 = await provider.createSubmission({
      storeId: JOLLY_ENTERPRISES.id,
      storeName: JOLLY_ENTERPRISES.name,
      customerName: 'Ravi Kumar',
      customerPhone: '9123456780',
      purchaseAmount: 50000,
      reward: JOLLY_ENTERPRISES.rewards[3],
      tier: JOLLY_ENTERPRISES.tiers[3],
      reviewCtaShown: false,
      reviewCtaClicked: false,
    }).then((r) => r.id)

    await provider.setCollectionStatus(id1, 'collected', { collectedBy: 'owner@shop.test' })
    const stats = await provider.getStats()
    expect(stats.totalSubmissions).toBe(2)
    expect(stats.collected).toBe(1)
    expect(stats.awaitingCollection).toBe(1)
    expect(stats.totalPurchaseValue).toBe(175000)
    void id2
  })
})
