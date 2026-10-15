import { describe, expect, it } from 'vitest'
import {
  parseAssignmentReward,
  parseAssignmentTier,
  toCollectionStatus,
} from './supabase'

/**
 * submit_customer_entry returns the saved reward/tier snapshot as jsonb columns
 * (typed `Json` by the generator). These tests pin the runtime parsing contract:
 * well-formed snapshots map exactly, malformed payloads fail loudly instead of
 * inventing data, and collection status maps conservatively.
 */

const validRewardJson = {
  id: '11111111-1111-4111-a111-111111111111',
  name: 'Silver Coin',
  wheel_label: 'SILVER COIN',
  description: 'A shiny coin',
  voucher_value: 2500,
  claim_code_prefix: 'GIFT',
  validity_text: 'Valid 30 days',
  active: true,
}

const validTierJson = {
  id: '22222222-2222-4222-a222-222222222222',
  min_amount: 10000,
  max_amount: 20000,
  reward_id: null,
  target_segment: 3,
  active: true,
}

describe('parseAssignmentReward', () => {
  it('maps a well-formed reward snapshot exactly', () => {
    const parsed = parseAssignmentReward(validRewardJson)
    expect(parsed).toEqual(validRewardJson)
  })

  it('maps nullable fields to null (never to invented strings)', () => {
    const parsed = parseAssignmentReward({
      ...validRewardJson,
      wheel_label: null,
      description: null,
      voucher_value: null,
      claim_code_prefix: null,
      validity_text: null,
    })
    expect(parsed.wheel_label).toBeNull()
    expect(parsed.description).toBeNull()
    expect(parsed.voucher_value).toBeNull()
    expect(parsed.claim_code_prefix).toBeNull()
    expect(parsed.validity_text).toBeNull()
  })

  it('rejects a payload without an id', () => {
    expect(() => parseAssignmentReward({ ...validRewardJson, id: undefined })).toThrow(
      /missing id/,
    )
  })

  it('rejects a payload without a name', () => {
    expect(() => parseAssignmentReward({ ...validRewardJson, name: '' })).toThrow(
      /missing name/,
    )
  })

  it('rejects non-object payloads', () => {
    expect(() => parseAssignmentReward(null)).toThrow(/Malformed reward/)
    expect(() => parseAssignmentReward(undefined)).toThrow(/Malformed reward/)
    expect(() => parseAssignmentReward([validRewardJson])).toThrow(/Malformed reward/)
    expect(() => parseAssignmentReward('reward')).toThrow(/Malformed reward/)
    expect(() => parseAssignmentReward(42)).toThrow(/Malformed reward/)
  })
})

describe('parseAssignmentTier', () => {
  it('maps a well-formed tier snapshot exactly', () => {
    expect(parseAssignmentTier(validTierJson)).toEqual(validTierJson)
  })

  it('preserves a nullable reward_id for pool brackets', () => {
    expect(parseAssignmentTier(validTierJson).reward_id).toBeNull()
    expect(
      parseAssignmentTier({ ...validTierJson, reward_id: '33333333-3333-4333-a333-333333333333' })
        .reward_id,
    ).toBe('33333333-3333-4333-a333-333333333333')
  })

  it('preserves an open-ended top bracket (max_amount null)', () => {
    expect(parseAssignmentTier({ ...validTierJson, max_amount: null }).max_amount).toBeNull()
  })

  it('rejects a payload without min_amount', () => {
    expect(() => parseAssignmentTier({ ...validTierJson, min_amount: undefined })).toThrow(
      /missing min_amount/,
    )
  })

  it('rejects a payload without target_segment', () => {
    expect(() => parseAssignmentTier({ ...validTierJson, target_segment: undefined })).toThrow(
      /missing target_segment/,
    )
  })

  it('rejects non-object payloads', () => {
    expect(() => parseAssignmentTier(null)).toThrow(/Malformed tier/)
    expect(() => parseAssignmentTier([])).toThrow(/Malformed tier/)
    expect(() => parseAssignmentTier(7)).toThrow(/Malformed tier/)
  })
})

describe('toCollectionStatus', () => {
  it("maps 'collected' to 'collected'", () => {
    expect(toCollectionStatus('collected')).toBe('collected')
  })

  it("maps 'awaiting' to 'awaiting'", () => {
    expect(toCollectionStatus('awaiting')).toBe('awaiting')
  })

  it("never maps unknown values to the irreversible 'collected' state", () => {
    expect(toCollectionStatus('unknown')).toBe('awaiting')
    expect(toCollectionStatus('')).toBe('awaiting')
    expect(toCollectionStatus('COLLECTED')).toBe('awaiting')
  })
})
