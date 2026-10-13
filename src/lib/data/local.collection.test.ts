import { describe, it, expect, beforeEach } from 'vitest'
import { LocalDataProvider } from './local'
import { JOLLY_ENTERPRISES } from '../stores'

function newProvider(): LocalDataProvider {
  return new LocalDataProvider()
}

async function seedSubmission(provider: LocalDataProvider) {
  const res = await provider.createSubmission({
    storeSlug: JOLLY_ENTERPRISES.slug,
    requestId: crypto.randomUUID(),
    customerName: 'Asha Rao',
    customerPhone: '9876543210',
    purchaseAmount: 125000,
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
    expect(list.items[0].collectionStatus).toBe('awaiting')
    expect(list.items[0].collectedAt).toBeNull()
    expect(list.items[0].collectedBy).toBeNull()
  })

  it('marks a gift collected and records the timestamp', async () => {
    const id = await seedSubmission(provider)
    await provider.markSubmissionCollected(id)
    const list = await provider.listSubmissions({ page: 1, pageSize: 20, search: '' })
    expect(list.items[0].collectionStatus).toBe('collected')
    expect(list.items[0].collectedAt).not.toBeNull()
    expect(Number.isNaN(Date.parse(list.items[0].collectedAt!))).toBe(false)
  })

  it('prevents duplicate collection: re-marking collected throws', async () => {
    const id = await seedSubmission(provider)
    await provider.markSubmissionCollected(id)
    await expect(provider.markSubmissionCollected(id)).rejects.toThrow(
      /already been collected/i,
    )
  })

  it('throws when marking an unknown submission', async () => {
    await expect(provider.markSubmissionCollected('does_not_exist')).rejects.toThrow(
      /not found/i,
    )
  })

  it('aggregates awaiting/collected counts in stats', async () => {
    const id1 = await seedSubmission(provider)
    await seedSubmission(provider)

    await provider.markSubmissionCollected(id1)
    const stats = await provider.getStats()
    expect(stats.totalSubmissions).toBe(2)
    expect(stats.collectedGifts).toBe(1)
    expect(stats.awaitingCollection).toBe(1)
    expect(stats.totalPurchaseValue).toBe(250000)
  })
})
