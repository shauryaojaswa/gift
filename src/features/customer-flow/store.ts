import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { FlowState, SpinStatus, CustomerInfo, ConsentState } from '@/types'
import type { RewardResult } from '@/lib/reward-engine'

const SESSION_KEY = 'gift:flow'

export interface CustomerFlowState {
  step: FlowState
  slug: string
  customerId: string | null
  fullName: string
  purchaseAmount: number | null
  phoneNumber: string
  consent: ConsentState
  reviewCtaShown: boolean
  reviewCtaClicked: boolean
  rewardResult: RewardResult | null
  spinStatus: SpinStatus
  currentRotation: number
  hasSpun: boolean
  submissionId: string | null
  createdAt: string
}

export interface CustomerFlowActions {
  init: (slug: string) => void
  restore: () => void
  setStep: (step: FlowState) => void
  setFullName: (value: string) => void
  setPurchaseAmount: (value: number | null) => void
  setPhoneNumber: (value: string) => void
  setConsent: (consent: ConsentState) => void
  setReviewCtaShown: (shown: boolean) => void
  setReviewCtaClicked: (clicked: boolean) => void
  setRewardResult: (result: RewardResult) => void
  startSpin: () => boolean
  completeSpin: (finalRotation: number) => void
  resetWheel: () => void
  setSubmissionId: (id: string | null) => void
  resetAll: () => void
  getCustomerInfo: () => CustomerInfo
}

export type CustomerFlowStore = CustomerFlowState & CustomerFlowActions

const initial: CustomerFlowState = {
  step: 'WELCOME',
  slug: '',
  customerId: null,
  fullName: '',
  purchaseAmount: null,
  phoneNumber: '',
  consent: { dataConsent: false, marketingConsent: false },
  reviewCtaShown: false,
  reviewCtaClicked: false,
  rewardResult: null,
  spinStatus: 'idle',
  currentRotation: 0,
  hasSpun: false,
  submissionId: null,
  createdAt: new Date().toISOString(),
}

const STORAGE_AVAILABLE = typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

function save(state: CustomerFlowState, slug: string): void {
  if (!STORAGE_AVAILABLE || !slug) return
  try {
    window.sessionStorage.setItem(`${SESSION_KEY}:${slug}`, JSON.stringify(state))
  } catch {
    /* ignore quota errors */
  }
}

function load(slug: string): CustomerFlowState | null {
  if (!STORAGE_AVAILABLE || !slug) return null
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_KEY}:${slug}`)
    if (!raw) return null
    return JSON.parse(raw) as CustomerFlowState
  } catch {
    return null
  }
}

const TRANSITIONS: Record<FlowState, FlowState[]> = {
  WELCOME: ['DETAILS'],
  DETAILS: ['WELCOME', 'REVIEW_INVITATION'],
  REVIEW_INVITATION: ['DETAILS', 'SPIN'],
  SPIN: ['REVIEW_INVITATION', 'SPINNING'],
  SPINNING: ['REWARD'],
  REWARD: ['THANK_YOU'],
  THANK_YOU: ['WELCOME'],
  COMPLETE: ['WELCOME'],
}

export const useCustomerFlow = create<CustomerFlowStore>()(
  devtools(
    (set, get) => ({
      ...initial,
      init: (slug: string) => {
        const saved = load(slug)
        if (saved) {
          const recovered = recover(saved, slug)
          set(() => ({ ...recovered }))
          save(recovered, slug)
          return
        }
        set(() => ({ ...initial, step: 'WELCOME', slug, createdAt: new Date().toISOString() }))
        save({ ...initial, step: 'WELCOME', slug, createdAt: new Date().toISOString() }, slug)
      },
      restore: () => {
        const { slug } = get()
        if (!slug) return
        const saved = load(slug)
        if (saved) {
          const recovered = recover(saved, slug)
          set(() => ({ ...recovered }))
          save(recovered, slug)
        }
      },
      setStep: (step: FlowState) => {
        const current = get().step
        if (step !== current && !TRANSITIONS[current]?.includes(step)) return
        set((state) => {
          const next = { ...state, step }
          save(next, state.slug)
          return next
        })
      },
      setFullName: (value) => set((s) => persist(s, { fullName: value })),
      setPurchaseAmount: (value) => set((s) => persist(s, { purchaseAmount: value })),
      setPhoneNumber: (value) => set((s) => persist(s, { phoneNumber: value })),
      setConsent: (consent) => set((s) => persist(s, { consent })),
      setReviewCtaShown: (shown) => set((s) => persist(s, { reviewCtaShown: shown })),
      setReviewCtaClicked: (clicked) => set((s) => persist(s, { reviewCtaClicked: clicked })),
      setRewardResult: (result) => set((s) => persist(s, { rewardResult: result })),
      startSpin: () => {
        const current = get()
        if (current.hasSpun || current.spinStatus !== 'idle') return false
        set((s) => persist(s, { spinStatus: 'spinning', hasSpun: true }))
        return true
      },
      completeSpin: (finalRotation) =>
        set((s) => persist(s, { spinStatus: 'completed', currentRotation: finalRotation, step: 'REWARD' })),
      resetWheel: () => set((s) => persist(s, { spinStatus: 'idle', currentRotation: 0 })),
      setSubmissionId: (id) => set((s) => persist(s, { submissionId: id })),
      resetAll: () => {
        const slug = get().slug
        const state = { ...initial, slug, createdAt: new Date().toISOString() }
        set(() => state)
        save(state, slug)
      },
      getCustomerInfo: (): CustomerInfo => {
        const s = get()
        return {
          fullName: s.fullName,
          purchaseAmount: s.purchaseAmount ?? 0,
          phoneNumber: s.phoneNumber,
        }
      },
    }),
    { name: 'customer-flow' },
  ),
)

function persist(s: CustomerFlowState, patch: Partial<CustomerFlowState>): CustomerFlowState {
  const next = { ...s, ...patch }
  save(next, s.slug)
  return next
}

function recover(saved: CustomerFlowState, slug: string): CustomerFlowState {
  if (!saved.slug) saved.slug = slug

  if (saved.step === 'WELCOME') {
    return { ...initial, slug, createdAt: saved.createdAt || new Date().toISOString() }
  }

  if (
    (saved.step === 'SPINNING' || saved.step === 'SPIN') &&
    saved.spinStatus === 'spinning'
  ) {
    if (saved.rewardResult) {
      saved.step = 'REWARD'
      saved.spinStatus = 'completed'
    } else {
      saved.step = 'SPIN'
      saved.spinStatus = 'idle'
      saved.hasSpun = false
    }
  }

  return saved
}

export function clearFlowSession(slug: string): void {
  if (!STORAGE_AVAILABLE) return
  window.sessionStorage.removeItem(`${SESSION_KEY}:${slug}`)
}
