import type { GiftColumnsConfig } from '../types'

/**
 * Eight editable gift fields - one per wheel segment.
 *
 * Rules (deliberately strict, enforced here AND in the backend RPC):
 *   - a field is blank until the owner fills it; nothing is invented or
 *     prepopulated;
 *   - partial drafts save as-is and report "N of 8 gifts configured";
 *   - publishing requires all 8 fields non-empty (whitespace is empty) and
 *     replaces the live wheel atomically - a partial configuration is never
 *     published;
 *   - blank fields can never become prizes, assignments or blank segments.
 */

export const GIFT_COLUMN_COUNT = 8

const MAX_GIFT_NAME_LENGTH = 64

/** A fresh, fully blank draft (8 empty fields). */
export function emptyGiftDraft(): string[] {
  return Array.from({ length: GIFT_COLUMN_COUNT }, () => '')
}

/** Coerce any draft-ish value to exactly 8 string fields (missing = blank). */
export function normalizeGiftDraft(draft: unknown): string[] {
  const source = Array.isArray(draft) ? draft : []
  return Array.from({ length: GIFT_COLUMN_COUNT }, (_, index) => {
    const value = source[index]
    return typeof value === 'string' ? value : ''
  })
}

/** Trim every field to its saved form (whitespace-only fields become blank). */
export function trimGiftDraft(draft: string[]): string[] {
  return normalizeGiftDraft(draft).map((value) => value.trim().slice(0, MAX_GIFT_NAME_LENGTH))
}

export function isBlankGift(value: string): boolean {
  return value.trim() === ''
}

/** How many fields are configured (non-blank) - "N of 8 gifts configured". */
export function configuredGiftCount(draft: string[]): number {
  return normalizeGiftDraft(draft).filter((value) => !isBlankGift(value)).length
}

/** 1-based field numbers that are still blank - the missing fields list. */
export function missingGiftFields(draft: string[]): number[] {
  return normalizeGiftDraft(draft)
    .map((value, index) => (isBlankGift(value) ? index + 1 : 0))
    .filter((index) => index > 0)
}

/** Publish gate: every field filled with a real name. */
export function canPublishGifts(draft: string[]): boolean {
  return missingGiftFields(draft).length === 0
}

/** Reject over-long names at the boundary (matches rewards.wheel_label width). */
export function validateGiftName(value: string): string | null {
  return value.trim().length > MAX_GIFT_NAME_LENGTH
    ? `Gift names must be ${MAX_GIFT_NAME_LENGTH} characters or fewer.`
    : null
}

/** A never-published gift-columns config (the delivered blank state). */
export function blankGiftColumns(): GiftColumnsConfig {
  return { draft: emptyGiftDraft(), published: null, publishedAt: null }
}

/**
 * Parse the backend's `stores.gift_columns` jsonb defensively: malformed or
 * absent data degrades to "no gift columns" instead of inventing gifts.
 */
export function parseGiftColumns(raw: unknown): GiftColumnsConfig | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const draftRaw = rec.draft
  const publishedRaw = rec.published
  const publishedAtRaw = rec.publishedAt
  const published = Array.isArray(publishedRaw)
    ? publishedRaw
        .map((slot) => {
          if (slot === null || typeof slot !== 'object') return null
          const s = slot as Record<string, unknown>
          const name = typeof s.name === 'string' ? s.name : ''
          const rewardId = typeof s.rewardId === 'string' ? s.rewardId : null
          return name.trim() !== '' && rewardId ? { name, rewardId } : null
        })
        .filter((slot): slot is { name: string; rewardId: string } => slot !== null)
    : null
  return {
    draft: normalizeGiftDraft(draftRaw),
    published: published && published.length === GIFT_COLUMN_COUNT ? published : null,
    publishedAt: typeof publishedAtRaw === 'string' ? publishedAtRaw : null,
  }
}
