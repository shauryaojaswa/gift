import { describe, it, expect, beforeEach } from 'vitest'
import { useCustomerFlow } from './store'
import { JOLLY_ENTERPRISES, JOLLY_ENTERPRISES_SLUG } from '../../lib/stores'
import { evaluateReward } from '../../lib/reward-engine'

const sampleResult = evaluateReward(50000, JOLLY_ENTERPRISES)!

function resetSpinState() {
  useCustomerFlow.setState({
    step: 'SPIN',
    slug: JOLLY_ENTERPRISES_SLUG,
    customerId: 'cust_1',
    fullName: 'Test Customer',
    purchaseAmount: 50000,
    phoneNumber: '9999999999',
    consent: { dataConsent: true, marketingConsent: false },
    reviewCtaShown: false,
    reviewCtaClicked: false,
    rewardResult: sampleResult,
    spinStatus: 'idle',
    currentRotation: 0,
    hasSpun: false,
    submissionId: null,
    createdAt: new Date().toISOString(),
  } as any)
}

describe('customer-flow spin completion', () => {
  beforeEach(() => {
    resetSpinState()
  })

  it('startSpin keeps the flow on the SPIN step', () => {
    expect(useCustomerFlow.getState().startSpin()).toBe(true)
    const s = useCustomerFlow.getState()
    expect(s.step).toBe('SPIN')
    expect(s.spinStatus).toBe('spinning')
    expect(s.hasSpun).toBe(true)
  })

  it('blocks a second spin request', () => {
    const flow = useCustomerFlow.getState()
    expect(flow.startSpin()).toBe(true)
    expect(useCustomerFlow.getState().startSpin()).toBe(false)
    expect(useCustomerFlow.getState().spinStatus).toBe('spinning')
  })

  it('completeSpin advances the flow to the REWARD step', () => {
    useCustomerFlow.getState().startSpin()
    useCustomerFlow.getState().completeSpin(12345)
    const s = useCustomerFlow.getState()
    expect(s.step).toBe('REWARD')
    expect(s.spinStatus).toBe('completed')
    expect(s.currentRotation).toBe(12345)
  })
})

describe('customer-flow session recovery', () => {
  const KEY = `gift:flow:${JOLLY_ENTERPRISES_SLUG}`

  beforeEach(() => {
    window.sessionStorage.removeItem(KEY)
    useCustomerFlow.setState({
      step: 'SPIN',
      slug: JOLLY_ENTERPRISES_SLUG,
      customerId: null,
      fullName: '',
      purchaseAmount: 50000,
      phoneNumber: '',
      consent: { dataConsent: false, marketingConsent: false },
      reviewCtaShown: false,
      reviewCtaClicked: false,
      rewardResult: null,
      spinStatus: 'spinning',
      currentRotation: 1234,
      hasSpun: true,
      submissionId: null,
      createdAt: new Date().toISOString(),
    } as any)
  })

  it('recovers a completed deterministic reward after refresh during a spin', () => {
    useCustomerFlow.getState().setRewardResult(sampleResult)
    const stale = useCustomerFlow.getState()
    stale.spinStatus = 'spinning'
    stale.hasSpun = true
    stale.reviewReturnDetected = true
    window.sessionStorage.setItem(KEY, JSON.stringify(stale))

    useCustomerFlow.getState().init(JOLLY_ENTERPRISES_SLUG)
    const s = useCustomerFlow.getState()
    expect(s.step).toBe('REWARD')
    expect(s.spinStatus).toBe('completed')
    expect(s.hasSpun).toBe(true)
    expect(s.reviewReturnDetected).toBe(false)
    expect(s.rewardResult?.reward.id).toBe('reward_4')
  })

  it('allows an interrupted spin with no reward to be retried safely', () => {
    const stale = useCustomerFlow.getState()
    window.sessionStorage.setItem(KEY, JSON.stringify(stale))

    useCustomerFlow.getState().init(JOLLY_ENTERPRISES_SLUG)
    const s = useCustomerFlow.getState()
    expect(s.step).toBe('SPIN')
    expect(s.spinStatus).toBe('idle')
    expect(s.hasSpun).toBe(false)
  })
})
