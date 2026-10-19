import { describe, expect, it } from 'vitest'
import {
  GIFT_COLUMN_COUNT,
  blankGiftColumns,
  canPublishGifts,
  configuredGiftCount,
  emptyGiftDraft,
  missingGiftFields,
  normalizeGiftDraft,
  parseGiftColumns,
  trimGiftDraft,
  validateGiftName,
} from './gift-columns'

function fields(filled: number): string[] {
  return Array.from({ length: GIFT_COLUMN_COUNT }, (_, i) => (i < filled ? `Gift ${i + 1}` : ''))
}

describe('gift columns - draft rules', () => {
  it('starts with exactly 8 blank fields - nothing invented or prepopulated', () => {
    const draft = emptyGiftDraft()
    expect(draft).toHaveLength(8)
    expect(draft.every((v) => v === '')).toBe(true)
    expect(configuredGiftCount(draft)).toBe(0)
    expect(missingGiftFields(draft)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(canPublishGifts(draft)).toBe(false)
    expect(blankGiftColumns()).toEqual({ draft, published: null, publishedAt: null })
  })

  it('partial drafts count configured fields and list the missing ones', () => {
    // 1 of 8
    const one = fields(1)
    expect(configuredGiftCount(one)).toBe(1)
    expect(missingGiftFields(one)).toEqual([2, 3, 4, 5, 6, 7, 8])
    // 7 of 8
    const seven = fields(7)
    expect(configuredGiftCount(seven)).toBe(7)
    expect(missingGiftFields(seven)).toEqual([8])
  })

  it('normalizes any draft-ish value to exactly 8 string fields', () => {
    expect(normalizeGiftDraft(undefined)).toEqual(fields(0))
    expect(normalizeGiftDraft(null)).toEqual(fields(0))
    expect(normalizeGiftDraft(['a'])).toEqual(['a', '', '', '', '', '', '', ''])
    expect(normalizeGiftDraft(['a', 1, null, {}, 'b'])).toEqual(['a', '', '', '', 'b', '', '', ''])
    expect(normalizeGiftDraft(fields(8).concat('extra'))).toHaveLength(8)
  })
})

describe('gift columns - publish gate (0/1/7/8 fields)', () => {
  it('blocks publishing with 0, 1 or 7 filled fields', () => {
    expect(canPublishGifts(fields(0))).toBe(false)
    expect(canPublishGifts(fields(1))).toBe(false)
    expect(canPublishGifts(fields(7))).toBe(false)
  })

  it('allows publishing with all 8 fields filled', () => {
    expect(canPublishGifts(fields(8))).toBe(true)
  })

  it('treats whitespace-only fields as empty', () => {
    const draft = fields(8)
    draft[3] = '   '
    expect(canPublishGifts(draft)).toBe(false)
    expect(missingGiftFields(draft)).toEqual([4])
    expect(configuredGiftCount(draft)).toBe(7)
  })

  it('trims saved fields - whitespace-only becomes blank', () => {
    const trimmed = trimGiftDraft([' Gold Ring ', '', '  ', 'Diamond Set'])
    expect(trimmed[0]).toBe('Gold Ring')
    expect(trimmed[1]).toBe('')
    expect(trimmed[2]).toBe('')
    expect(trimmed[3]).toBe('Diamond Set')
    expect(canPublishGifts(trimmed)).toBe(false)
  })

  it('rejects over-long gift names (wheel-label width)', () => {
    expect(validateGiftName('Gold Ring')).toBeNull()
    expect(validateGiftName('x'.repeat(64))).toBeNull()
    expect(validateGiftName('x'.repeat(65))).not.toBeNull()
    expect(validateGiftName(' ' + 'x'.repeat(65) + ' ')).not.toBeNull()
  })
})

describe('gift columns - backend config parsing', () => {
  it('reads draft and published separately - draft edits never touch published', () => {
    const cfg = parseGiftColumns({
      draft: fields(3),
      published: fields(8).map((name, i) => ({ name, rewardId: `r${i}` })),
      publishedAt: '2026-10-19T00:00:00.000Z',
    })
    expect(cfg?.draft).toEqual(fields(3))
    expect(cfg?.published).toHaveLength(8)
    expect(cfg?.publishedAt).toBe('2026-10-19T00:00:00.000Z')
  })

  it('never keeps a partial or blank published set - anything malformed is "not published"', () => {
    expect(parseGiftColumns({ draft: fields(8), published: null, publishedAt: null })?.published).toBeNull()
    expect(parseGiftColumns({ draft: fields(8) })?.published).toBeNull()
    // 7 slots only: rejected
    expect(
      parseGiftColumns({ draft: fields(8), published: fields(7).map((name, i) => ({ name, rewardId: `r${i}` })) })
        ?.published,
    ).toBeNull()
    // a blank slot name can never be a published prize
    expect(
      parseGiftColumns({
        draft: fields(8),
        published: fields(8).map((name, i) => ({ name: i === 2 ? '   ' : name, rewardId: `r${i}` })),
      })?.published,
    ).toBeNull()
  })

  it('malformed payloads degrade to "no gift columns", never to invented gifts', () => {
    expect(parseGiftColumns(null)).toBeNull()
    expect(parseGiftColumns('nonsense')).toBeNull()
    expect(parseGiftColumns([1, 2, 3])).toBeNull()
  })
})
