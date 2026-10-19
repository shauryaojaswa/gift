/**
 * Store-specific Google review recommendations.
 *
 * Each shop gets the recommendations that fit its business type - the same
 * Share Your Experience modal, topic chips, copy and Google link, but with the
 * right starter sentences for what the shop actually sells. The two sets are
 * deliberately different lists; nothing here is shared across shop types.
 *
 * - Jewellery: the ten review starters exactly as approved in the customer's
 *   prototype. Restored verbatim from the original jewellery implementation -
 *   these sentences must never be rewritten, paraphrased or reordered, and the
 *   topics are the ones previously set for the jewellery review flow
 *   (Service / Collection / Staff / Quality / Price / Shopping Experience /
 *   My Visit).
 * - Clothing: starters for an ethnic-wear and clothing shop covering the
 *   collections, fabric and garment quality, variety, staff help, prices,
 *   fitting/size and the overall visit.
 */

/** The review topics previously set for the jewellery review flow. */
export const REVIEW_TOPICS = [
  'Service',
  'Collection',
  'Staff',
  'Quality',
  'Price',
  'Shopping Experience',
  'My Visit',
] as const

export type ReviewTopic = (typeof REVIEW_TOPICS)[number]

export interface ReviewSuggestion {
  /** The sentence shown to the customer - copied verbatim on tap. */
  text: string
  icon: string
  /** Which of the store's topics this sentence can help describe. */
  topics: ReviewTopic[]
}

export interface ReviewSet {
  /** Topic chips for this store, in order. */
  topics: typeof REVIEW_TOPICS
  suggestions: ReviewSuggestion[]
}

/**
 * The jewellery recommendations, verbatim from the customer-approved
 * prototype. Do not edit these sentences.
 */
const JEWELLERY_SUGGESTIONS: ReviewSuggestion[] = [
  { text: 'I really liked the jewellery designs.', icon: 'sparkle', topics: ['Collection'] },
  { text: 'Good quality and good service.', icon: 'tag', topics: ['Quality', 'Service'] },
  { text: 'Very smooth shopping experience.', icon: 'bag', topics: ['Shopping Experience'] },
  { text: 'The staff helped me choose the right jewellery.', icon: 'user', topics: ['Staff'] },
  { text: 'I was happy with the overall experience.', icon: 'heart', topics: ['My Visit'] },
  { text: 'Good value for the quality.', icon: 'tag', topics: ['Price', 'Quality'] },
  { text: 'I found exactly what I was looking for.', icon: 'package', topics: ['Shopping Experience'] },
  { text: 'Nice experience from start to finish.', icon: 'heart', topics: ['Shopping Experience'] },
  { text: 'The collection had many beautiful options.', icon: 'gem', topics: ['Collection'] },
  { text: 'My visit was a pleasant experience.', icon: 'sparkle', topics: ['My Visit'] },
]

const JEWELLERY_SET: ReviewSet = {
  topics: REVIEW_TOPICS,
  suggestions: JEWELLERY_SUGGESTIONS,
}

/** Clothing and ethnic-wear starters. */
const CLOTHING_SUGGESTIONS: ReviewSuggestion[] = [
  { text: 'The service was warm and helpful throughout my visit.', icon: 'hands', topics: ['Service'] },
  { text: 'Loved the ethnic wear collection — so many beautiful options.', icon: 'gem', topics: ['Collection'] },
  { text: 'They have a lovely range of sarees, kurtas and festive wear.', icon: 'sparkle', topics: ['Collection'] },
  { text: 'The staff helped me pick the right outfit and the perfect size.', icon: 'user', topics: ['Staff'] },
  { text: 'The fabric and stitching quality of my outfit is excellent.', icon: 'badge', topics: ['Quality'] },
  { text: 'The fitting of the ready-made garments was just right.', icon: 'package', topics: ['Quality'] },
  { text: 'The prices are fair for the quality you get.', icon: 'tag', topics: ['Price'] },
  { text: 'Shopping here was smooth and easy from start to finish.', icon: 'bag', topics: ['Shopping Experience'] },
  { text: 'I found exactly what I needed for the occasion.', icon: 'smile', topics: ['Shopping Experience'] },
  { text: 'My visit to the store was a really pleasant experience.', icon: 'heart', topics: ['My Visit'] },
]

const CLOTHING_SET: ReviewSet = {
  topics: REVIEW_TOPICS,
  suggestions: CLOTHING_SUGGESTIONS,
}

/**
 * Recommendations by shop slug. Jewellers are the platform's home audience, so
 * a shop without an explicit entry gets the jewellery set; clothing shops are
 * mapped by their store identifier here.
 */
const REVIEW_SETS: Record<string, ReviewSet> = {
  shreejwellers: JEWELLERY_SET,
  bcy: JEWELLERY_SET,
  shreemanali: CLOTHING_SET,
}

export function reviewSetFor(storeSlug: string | null | undefined): ReviewSet {
  return REVIEW_SETS[(storeSlug ?? '').toLowerCase()] || JEWELLERY_SET
}
