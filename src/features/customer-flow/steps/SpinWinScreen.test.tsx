import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useCustomerFlow } from '../store'
import { StoreConfigProvider } from '../StoreContext'
import { SpinWinScreen, getWheelSize } from './SpinWinScreen'
import { JOLLY_ENTERPRISES, JOLLY_ENTERPRISES_SLUG } from '../../../lib/stores'
import { normalizeAngle, segmentCenterDegrees } from '../../../lib/wheel-math'
import {
  buildWheelSegments,
  landingSegmentIndex,
  type RewardResult,
} from '../../../lib/reward-engine'
import { DataProviderProvider } from '../../../providers/DataProviderContext'
import { LocalDataProvider } from '../../../lib/data/local'
import type { GiftOption, RewardTier } from '../../../types'

/**
 * Spin & Win - tap to reward, v1.2.0 persist-first contract:
 * the reward is already saved when the wheel appears, so spinning is pure
 * animation to the saved slice - no RPC runs at spin time.
 */

const provider = new LocalDataProvider()
const createSubmission = vi.spyOn(provider, 'createSubmission')

let scheduled: Array<{ id: number; cb: FrameRequestCallback }>
let nextId: number
let now: number
let cancelled: Set<number>
let originalMatchMedia: typeof window.matchMedia | undefined

function tick(ms: number): void {
  now += ms
  const batch = scheduled.splice(0, scheduled.length)
  for (const { id, cb } of batch) {
    if (!cancelled.has(id)) cb(now)
  }
}

function runAnimation(): void {
  // Drive every animation frame to completion in one act.
  for (let i = 0; i < 400 && useCustomerFlow.getState().spinStatus === 'spinning'; i += 1) {
    tick(50)
  }
}

const pool: GiftOption[] = [
  { id: 'g1', name: 'Gold Coin', wheelLabel: 'GOLD COIN', description: 'A gold coin', voucherValue: null },
  { id: 'g2', name: 'Silver Coin', wheelLabel: 'SILVER COIN', description: 'A silver coin', voucherValue: null },
  { id: 'g3', name: 'Gift Hamper', wheelLabel: 'GIFT HAMPER', description: 'A hamper', voucherValue: null },
  { id: 'g4', name: 'Care Voucher', wheelLabel: 'CARE VOUCHER', description: 'Care voucher', voucherValue: 500 },
]

const poolTier: RewardTier = {
  id: 'pool-tier',
  minAmount: 10000,
  maxAmount: 20000,
  rewardId: null,
  targetSegment: 1,
  active: true,
  giftOptions: pool,
}

// The saved assignment deliberately differs from live config (shortLabel
// "WINNER") so tests can prove the snapshot wins over the pool labels.
const savedReward: RewardResult = {
  amount: 15000,
  tier: poolTier,
  reward: {
    id: 'g2',
    name: 'Silver Coin Gift Box',
    shortLabel: 'WINNER',
    description: 'A silver coin',
    voucherValue: null,
    claimCodePrefix: 'SIL',
    validityText: null,
    active: true,
  },
  targetSegment: 1,
}

function renderScreen(): ReturnType<typeof render> {
  return render(
    <DataProviderProvider provider={provider}>
      <StoreConfigProvider store={JOLLY_ENTERPRISES}>
        <SpinWinScreen />
      </StoreConfigProvider>
    </DataProviderProvider>,
  )
}

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
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  originalMatchMedia = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
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
  window.sessionStorage.clear()
  window.localStorage.clear()
  createSubmission.mockClear()
  act(() => {
    useCustomerFlow.setState({
      step: 'SPIN',
      slug: JOLLY_ENTERPRISES_SLUG,
      purchaseAmount: 15000,
      fullName: 'Test Customer',
      phoneNumber: '9876543210',
      submissionRequestId: 'req-1',
      submissionId: 'sub-1',
      claimCode: 'SIL-1',
      rewardResult: savedReward,
      spinStatus: 'idle',
      currentRotation: 0,
      hasSpun: false,
      reviewReturnDetected: false,
    })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      configurable: true,
      writable: true,
    })
  }
})

describe('Spin & Win - tap to reward', () => {
  it('renders the wheel from real pool prizes with the saved reward winning', () => {
    const { container } = renderScreen()
    const texts = Array.from(container.querySelectorAll('svg[role="img"] text'))
    const labels = texts.map((t) => t.getAttribute('aria-label'))
    expect(labels).toContain('GOLD COIN')
    expect(labels).toContain('SILVER COIN')
    expect(labels).toContain('GIFT HAMPER')
    expect(labels).toContain('CARE VOUCHER')
    // The saved assignment overrides its slice with the snapshot name.
    expect(labels).toContain('WINNER')
    // Placeholder labels are forbidden.
    expect(labels).not.toContain('GIFT')
    // WCAG 2.5.3: the wheel's accessible name contains its visible labels.
    const svg = container.querySelector('svg[role="img"]')!
    const name = svg.getAttribute('aria-label') ?? ''
    expect(name).toContain('GOLD COIN')
    expect(name).toContain('WINNER')
    // Prize data is unchanged by the concise on-slice rendering.
    const segments = buildWheelSegments(pool, savedReward)
    expect(segments[landingSegmentIndex(segments, savedReward)].rewardId).toBe('g2')
  })

  it('taps the real SPIN button, spins without any RPC, and lands on the saved reward', async () => {
    const { container } = renderScreen()
    expect(useCustomerFlow.getState().step).toBe('SPIN')
    const spinButton = screen.getByRole('button', { name: 'Spin the wheel' })
    fireEvent.click(spinButton)

    // Persist-first: the claim already exists, spinning must never call the API.
    expect(createSubmission).not.toHaveBeenCalled()
    expect(useCustomerFlow.getState().spinStatus).toBe('spinning')
    expect(
      screen.getByRole('button', { name: 'Spinning...' }),
    ).toBeTruthy()

    // Mid-spin evidence: the wheel is actually rotating before it settles.
    await act(async () => {
      tick(300)
    })
    expect(useCustomerFlow.getState().spinStatus).toBe('spinning')

    await act(async () => {
      runAnimation()
    })

    await waitFor(() => expect(useCustomerFlow.getState().step).toBe('REWARD'))
    expect(createSubmission).not.toHaveBeenCalled()

    // The final stop aligns exactly with the persisted reward's slice.
    const segments = buildWheelSegments(pool, savedReward)
    const landing = landingSegmentIndex(segments, savedReward)
    const rotation = useCustomerFlow.getState().currentRotation
    expect(
      normalizeAngle(rotation + segmentCenterDegrees(landing, segments.length)),
    ).toBeCloseTo(0)

    // The landed slice is highlighted and the spin cannot be repeated.
    expect(container.querySelector('.wheel-segment-won')).toBeTruthy()
    expect(useCustomerFlow.getState().hasSpun).toBe(true)
  })

  it('completes under reduced motion and still lands on the saved reward', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
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
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Spin the wheel' }))
    await waitFor(() => expect(useCustomerFlow.getState().step).toBe('REWARD'), { timeout: 2000 })
    const segments = buildWheelSegments(pool, savedReward)
    const landing = landingSegmentIndex(segments, savedReward)
    expect(
      normalizeAngle(
        useCustomerFlow.getState().currentRotation + segmentCenterDegrees(landing, segments.length),
      ),
    ).toBeCloseTo(0)
  })

  it('shows the automatic return welcome and spins from the same saved claim', async () => {
    act(() => {
      useCustomerFlow.setState({ reviewReturnDetected: true })
    })
    renderScreen()
    expect(screen.getByRole('heading', { name: 'WELCOME BACK!' })).toBeTruthy()
    const spinNow = screen.getByRole('button', { name: 'Spin Now' })
    fireEvent.click(spinNow)
    expect(createSubmission).not.toHaveBeenCalled()
    expect(useCustomerFlow.getState().spinStatus).toBe('spinning')
    await act(async () => {
      runAnimation()
    })
    await waitFor(() => expect(useCustomerFlow.getState().step).toBe('REWARD'))
  })

  it('never offers a spin when no reward was saved', () => {
    act(() => {
      useCustomerFlow.setState({ rewardResult: null })
    })
    renderScreen()
    expect(
      screen.getByRole('heading', { name: 'YOUR REWARD IS NOT READY' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spin the wheel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'BACK TO DETAILS' })).toBeTruthy()
  })

  it('uses a larger responsive wheel and concise labels without changing prize data', () => {
    const setWidth = (width: number) => {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
    }
    setWidth(390)
    expect(getWheelSize()).toBe(342)
    setWidth(1200)
    expect(getWheelSize()).toBe(420)
    setWidth(250)
    expect(getWheelSize()).toBe(220)
  })
})
