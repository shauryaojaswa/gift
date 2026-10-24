import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { SpinWheel, SPIN_DURATION_MS, SPIN_REDUCED_MOTION_DURATION_MS } from './SpinWheel'
import type { WheelSegment } from '@/types'

/**
 * Per-store spin duration (stores.spin_duration_ms) - the animation length is
 * presentation timing that shops may specify differently:
 *   - the shared default stays exactly SPIN_DURATION_MS (5000, the released
 *     spec for the Pashupati wheel) when no override is configured;
 *   - a configured override (BCY Jewellers: 6000 - "approximately six seconds")
 *     is what the animation is actually driven with;
 *   - the gentler reduced-motion variant is unchanged everywhere.
 * The duration is asserted at the animateSpin boundary, so these tests pin the
 * real driver input rather than a constant.
 */

const animateSpin = vi.fn()

vi.mock('../../lib/wheel-math', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/wheel-math')>()
  return {
    ...mod,
    animateSpin: (
      startAngle: number,
      targetAngle: number,
      durationMs: number,
      onFrame: (angle: number) => void,
      onComplete: () => void,
    ) => {
      animateSpin(startAngle, targetAngle, durationMs, onFrame, onComplete)
      return {
        cancel: () => {},
        currentAngle: () => targetAngle,
        isRunning: () => false,
      }
    },
  }
})

const segments: WheelSegment[] = Array.from({ length: 8 }, (_, index) => ({
  index,
  rewardId: `gift-${index}`,
  rewardName: `Gift ${index + 1}`,
  rewardDescription: '',
  color: 'hsl(39 42% 68%)',
}))

function lastDuration(): number {
  const calls = animateSpin.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][2] as number
}

function renderWheel(spinDurationMs?: number): void {
  render(
    <SpinWheel
      segments={segments}
      targetSegment={3}
      isSpinning
      onSpinComplete={() => {}}
      spinDurationMs={spinDurationMs}
    />,
  )
}

let originalMatchMedia: typeof window.matchMedia | undefined

function stubReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  animateSpin.mockClear()
  originalMatchMedia = window.matchMedia
  stubReducedMotion(false)
})

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      configurable: true,
      writable: true,
    })
  }
})

describe('spin duration contract', () => {
  it('keeps the shared default (5000ms) when the store sets no override', () => {
    renderWheel()
    expect(lastDuration()).toBe(SPIN_DURATION_MS)
    expect(SPIN_DURATION_MS).toBe(5000)
  })

  it('drives the animation with the store override (BCY: 6 seconds)', () => {
    renderWheel(6000)
    expect(lastDuration()).toBe(6000)
  })

  it('leaves the reduced-motion variant unchanged even with an override', () => {
    stubReducedMotion(true)
    renderWheel(6000)
    expect(lastDuration()).toBe(SPIN_REDUCED_MOTION_DURATION_MS)
    expect(SPIN_REDUCED_MOTION_DURATION_MS).toBe(3000)
  })
})
