import { describe, expect, it } from 'vitest'
import {
  SPIN_DURATION_MS,
  SPIN_FULL_SPINS,
  SPIN_REDUCED_MOTION_DURATION_MS,
  SPIN_REDUCED_MOTION_FULL_SPINS,
  SPIN_REVEAL_SETTLE_MS,
} from './SpinWheel'

// The spin animation is the heart of Spin & Win and runs for exactly 5
// seconds before the reward is revealed (plus the 400ms reveal settle).
// These values are pinned: changing them changes the customer experience.
// (Release spec section 5 sets the Pashupati wheel animation to 5 seconds.)
describe('SpinWheel timing - pinned 5-second spin', () => {
  it('spins for exactly 5 seconds', () => {
    expect(SPIN_DURATION_MS).toBe(5000)
  })

  it('keeps the reveal settle at 400ms', () => {
    expect(SPIN_REVEAL_SETTLE_MS).toBe(400)
  })

  it('keeps the gentler reduced-motion variant unchanged', () => {
    expect(SPIN_REDUCED_MOTION_DURATION_MS).toBe(3000)
    expect(SPIN_REDUCED_MOTION_FULL_SPINS).toBeLessThan(SPIN_FULL_SPINS)
    expect(SPIN_FULL_SPINS).toBeGreaterThan(0)
  })
})
