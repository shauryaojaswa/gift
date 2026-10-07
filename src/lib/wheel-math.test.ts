import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  segmentAngle,
  segmentCenterDegrees,
  computeTargetRotation,
  normalizeAngle,
  normalizeSpinDelta,
  spinEase,
  animateSpin,
} from './wheel-math'

const SEGMENTS = 8

describe('wheel-math geometry', () => {
  it('segment angle is 360/n', () => {
    expect(segmentAngle(8)).toBe(45)
    expect(segmentAngle(10)).toBe(36)
  })

  it('segment center is the midpoint of each segment', () => {
    expect(segmentCenterDegrees(0, SEGMENTS)).toBe(22.5)
    expect(segmentCenterDegrees(7, SEGMENTS)).toBe(337.5)
    expect(segmentCenterDegrees(1, SEGMENTS)).toBe(67.5)
  })

  it('angles stay within [0,360)', () => {
    for (let i = 0; i < SEGMENTS; i++) {
      const c = segmentCenterDegrees(i, SEGMENTS)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(360)
    }
  })
})

describe('wheel-math target rotation', () => {
  it('lands exactly at segment centers (safe from boundaries)', () => {
    for (let i = 0; i < SEGMENTS; i++) {
      const { finalRotation } = computeTargetRotation(i, SEGMENTS, { fullSpins: 5, offsetFraction: 0.5 })
      const center = segmentCenterDegrees(i, SEGMENTS)
      expect(normalizeAngle(center + finalRotation)).toBeCloseTo(0, 5)
    }
  })

  it('always spins at least 5 full rotations forward', () => {
    const result = computeTargetRotation(3, SEGMENTS, { fullSpins: 5 })
    expect(result.finalRotation).toBeGreaterThanOrEqual(5 * 360)
  })

  it('respects custom offset toward segment center', () => {
    const result = computeTargetRotation(0, SEGMENTS, { fullSpins: 5, offsetFraction: 0.5 })
    expect(normalizeAngle(result.finalRotation)).toBeCloseTo(337.5, 5)
  })

  it('offset 0.25 lands 25% into the segment, still safe', () => {
    const segAngle = segmentAngle(SEGMENTS)
    const result = computeTargetRotation(2, SEGMENTS, { fullSpins: 6, offsetFraction: 0.25 })
    const landed = normalizeAngle(result.finalRotation)
    const expected = normalizeAngle(-(2 * segAngle + 0.25 * segAngle))
    expect(landed).toBeCloseTo(expected, 5)
  })
})

describe('wheel-math delta normalization', () => {
  it('guarantees minimum forward spins', () => {
    const delta = normalizeSpinDelta(0, 5 * 360 + 22.5, 5)
    expect(delta).toBeCloseTo(5 * 360 + 22.5, 5)
  })

  it('keeps forward motion when current angle is nonzero', () => {
    const delta = normalizeSpinDelta(300, 5 * 360 + 22.5, 5)
    // delta must be positive and >= 5*360
    expect(delta).toBeGreaterThanOrEqual(5 * 360 - 0.001)
    expect(delta).toBeLessThan(7 * 360)
  })
})

describe('wheel-math easing', () => {
  it('starts at 0 and ends at 1', () => {
    expect(spinEase(0)).toBeCloseTo(0, 5)
    expect(spinEase(1)).toBeCloseTo(1, 5)
  })

  it('monotonically non-decreasing', () => {
    let prev = spinEase(0)
    for (let i = 1; i <= 100; i++) {
      const t = i / 100
      const v = spinEase(t)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
  })

  it('ends with zero derivative (smooth stop)', () => {
    const h = 1e-5
    const derivative = (spinEase(1) - spinEase(1 - h)) / h
    expect(derivative).toBeCloseTo(0, 2)
  })
})

describe('wheel-math animateSpin', () => {
  let scheduled: Array<{ id: number; cb: FrameRequestCallback }>
  let nextId: number
  let now: number
  let cancelled: Set<number>

  beforeEach(() => {
    scheduled = []
    nextId = 0
    now = 0
    cancelled = new Set()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = ++nextId
      scheduled.push({ id, cb })
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelled.add(id)
    })
    vi.stubGlobal('performance', { now: () => now })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('receives the start angle immediately', () => {
    const frames: number[] = []
    animateSpin(10, 500, 1000, (a) => frames.push(a), () => {})
    expect(frames[0]).toBe(10)
  })

  it('advances frames with virtual time and completes after the duration', () => {
    const frames: number[] = []
    let completed = false
    animateSpin(0, 1822.5, 4800, (a) => frames.push(a), () => {
      completed = true
    })

    let guard = 0
    while (scheduled.length > 0 && guard < 2000) {
      now += 16.6
      const { id, cb } = scheduled.shift()!
      if (!cancelled.has(id)) cb(now)
      guard++
    }

    expect(completed).toBe(true)
    expect(frames[frames.length - 1]).toBeCloseTo(1822.5, 1)
  })

  it('cancel stops the animation without completing', () => {
    let completed = false
    let calls = 0
    const controller = animateSpin(0, 90, 5000, () => {
      calls++
    }, () => {
      completed = true
    })

    controller.cancel()

    let guard = 0
    while (scheduled.length > 0 && guard < 500) {
      now += 16.6
      const { id, cb } = scheduled.shift()!
      if (!cancelled.has(id)) cb(now)
      guard++
    }

    expect(completed).toBe(false)
    expect(calls).toBe(1) // only the immediate onFrame(startAngle)
    expect(controller.isRunning()).toBe(false)
  })
})
