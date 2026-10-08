import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useCustomerFlow } from '../store'
import { StoreConfigProvider } from '../StoreContext'
import { SpinWinScreen } from './SpinWinScreen'
import { JOLLY_ENTERPRISES, JOLLY_ENTERPRISES_SLUG } from '../../../lib/stores'
import { normalizeAngle, segmentCenterDegrees } from '../../../lib/wheel-math'
import { buildSegments } from '../../../lib/reward-engine'

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

  useCustomerFlow.setState({
    step: 'SPIN',
    slug: JOLLY_ENTERPRISES_SLUG,
    customerId: 'cust_1',
    fullName: 'Test Customer',
    purchaseAmount: 125000,
    phoneNumber: '9876543210',
    consent: { dataConsent: true, marketingConsent: false },
    reviewCtaShown: false,
    reviewCtaClicked: false,
    reviewReturnDetected: false,
    rewardResult: null,
    spinStatus: 'idle',
    currentRotation: 0,
    hasSpun: false,
    submissionId: null,
    createdAt: new Date().toISOString(),
  } as any)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function drainFrames() {
  await act(async () => {
    let guard = 0
    while (scheduled.length > 0 && guard < 2000) {
      now += 16.6
      const { id, cb } = scheduled.shift()!
      if (!cancelled.has(id)) cb(now)
      guard++
    }
  })
}

describe('Spin & Win — tap to reward', () => {
  it('uses a larger responsive wheel and concise labels without changing prize data', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })

    try {
      const { container } = render(
        <StoreConfigProvider store={JOLLY_ENTERPRISES}>
          <SpinWinScreen />
        </StoreConfigProvider>,
      )

      const wheel = container.querySelector('svg[role="img"]')
      expect(wheel?.parentElement).toHaveStyle({
        width: 'min(342px, 100%, calc(100vw - 48px))',
      })
      expect(Array.from(container.querySelectorAll('svg[role="img"] text')).map((label) => label.textContent))
        .toEqual([
          'JEWELLERYCLEANING',
          'CARE KIT',
          '₹500VOUCHER',
          'PREMIUMGIFT',
          '₹1,000VOUCHER',
          'SILVERGIFT',
          '₹2,500VOUCHER',
          '₹5,000VOUCHER',
        ])
      expect(buildSegments(JOLLY_ENTERPRISES).map(({ rewardName }) => rewardName)).toEqual(
        JOLLY_ENTERPRISES.tiers
          .map((tier) => JOLLY_ENTERPRISES.rewards.find((reward) => reward.id === tier.rewardId)?.name)
          .filter((name): name is string => Boolean(name)),
      )
      expect(useCustomerFlow.getState().rewardResult).toBeNull()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('shows the automatic return welcome and uses the existing spin result logic', async () => {
    useCustomerFlow.getState().setReviewReturnDetected(true)
    render(
      <StoreConfigProvider store={JOLLY_ENTERPRISES}>
        <SpinWinScreen />
      </StoreConfigProvider>,
    )

    expect(screen.getByRole('heading', { name: 'WELCOME BACK!' })).toBeInTheDocument()
    expect(screen.getByText("Ready to see what you've won?")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spin Now' })).toBeEnabled()
    expect(useCustomerFlow.getState().reviewReturnDetected).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Spin Now' }))
    })

    const spinning = useCustomerFlow.getState()
    expect(spinning.spinStatus).toBe('spinning')
    expect(spinning.hasSpun).toBe(true)
    expect(spinning.reviewReturnDetected).toBe(false)
    expect(spinning.rewardResult?.reward.id).toBe('reward_5')
  })

  it('taps the real SPIN button, spins the wheel, and lands on the reward', async () => {
    render(
      <StoreConfigProvider store={JOLLY_ENTERPRISES}>
        <SpinWinScreen />
      </StoreConfigProvider>,
    )

    const spinBtn = screen.getByRole('button', { name: /spin the wheel/i })
    expect(spinBtn).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(spinBtn)
    })

    // 11. HANDLE HANDLER EXECUTED: reward + spin state populated
    const mid = useCustomerFlow.getState()
    expect(mid.spinStatus).toBe('spinning')
    expect(mid.hasSpun).toBe(true)
    expect(mid.rewardResult).not.toBeNull()
    expect(mid.rewardResult!.reward.id).toBe('reward_5') // ₹1,25,000 -> ₹1,000 VOUCHER
    // button now disabled + relabeled (no double-spin)
    expect(spinBtn).toBeDisabled()
    expect(spinBtn).toHaveAttribute('aria-label', 'Spinning...')

    // 16-21. ANIMATION RUNS + COMPLETES via requestAnimationFrame loop
    await drainFrames()

    expect(document.querySelector('.wheel-segment-won')).not.toBeNull()
    expect(useCustomerFlow.getState().spinStatus).toBe('spinning')
    await waitFor(() => expect(useCustomerFlow.getState().step).toBe('REWARD'))

    // 12-14. COMPLETION -> REWARD STEP
    const final = useCustomerFlow.getState()
    expect(final.step).toBe('REWARD')
    expect(final.spinStatus).toBe('completed')
    expect(final.currentRotation).toBeGreaterThan(2160) // 6 full turns + settling
    expect(
      normalizeAngle(
        segmentCenterDegrees(final.rewardResult!.targetSegment, 8) + final.currentRotation,
      ),
    ).toBeCloseTo(0, 5)
  })
})
