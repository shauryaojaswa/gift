import { describe, expect, it } from 'vitest'
import { REVIEW_TOPICS, reviewSetFor } from './review-recommendations'

describe('review recommendations by shop', () => {
  it('BCY uses the shared jewellery recommendations, identical to Shree Jewellers', () => {
    const bcy = reviewSetFor('bcy')
    const shree = reviewSetFor('shreejwellers')
    expect(bcy).toBe(shree)
    expect(bcy.topics).toEqual(REVIEW_TOPICS)
    expect(bcy.suggestions.length).toBeGreaterThan(0)
    // The approved jewellery sentences are reused verbatim - nothing rewritten.
    expect(bcy.suggestions.map((s) => s.text)).toEqual(shree.suggestions.map((s) => s.text))
  })

  it('shop lookup is case-insensitive (URL slugs are case-insensitive addresses)', () => {
    expect(reviewSetFor('BCY')).toBe(reviewSetFor('bcy'))
    expect(reviewSetFor('ShreeJwellers')).toBe(reviewSetFor('shreejwellers'))
  })

  it('unknown shops keep the jewellery default (unchanged behaviour)', () => {
    expect(reviewSetFor('unknown-shop')).toBe(reviewSetFor('shreejwellers'))
    expect(reviewSetFor(null)).toBe(reviewSetFor('shreejwellers'))
    expect(reviewSetFor(undefined)).toBe(reviewSetFor('shreejwellers'))
  })

  it('the clothing shop keeps its own set', () => {
    expect(reviewSetFor('shreemanali')).not.toBe(reviewSetFor('shreejwellers'))
  })
})
