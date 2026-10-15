import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { useDataProvider } from '@/providers/DataProviderContext'
import { SpinWheel } from '@/components/ui/SpinWheel'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { buildSegments } from '@/lib/reward-engine'
import { formatINR } from '@/lib/currency'
import type { WheelSegment } from '@/types'

export function getWheelSize(): number {
  if (typeof window === 'undefined') return 360
  return Math.max(220, Math.min(420, window.innerWidth - 48))
}

export function SpinWinScreen() {
  const store = useStoreConfigValue()
  const dataProvider = useDataProvider()
  const requestStarted = useRef(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const {
    purchaseAmount,
    fullName,
    phoneNumber,
    submissionRequestId,
    reviewCtaShown,
    reviewCtaClicked,
    hasSpun,
    spinStatus,
    reviewReturnDetected,
    rewardResult,
    setRewardResult,
    setSubmissionId,
    setClaimCode,
    startSpin,
    completeSpin,
  } = useCustomerFlow((s) => ({
    purchaseAmount: s.purchaseAmount,
    fullName: s.fullName,
    phoneNumber: s.phoneNumber,
    submissionRequestId: s.submissionRequestId,
    reviewCtaShown: s.reviewCtaShown,
    reviewCtaClicked: s.reviewCtaClicked,
    hasSpun: s.hasSpun,
    spinStatus: s.spinStatus,
    reviewReturnDetected: s.reviewReturnDetected,
    rewardResult: s.rewardResult,
    setRewardResult: s.setRewardResult,
    setSubmissionId: s.setSubmissionId,
    setClaimCode: s.setClaimCode,
    startSpin: s.startSpin,
    completeSpin: s.completeSpin,
  }))

  const segments: WheelSegment[] = useMemo(
    () => buildSegments(store, rewardResult),
    [store, rewardResult],
  )
  const [targetSegment, setTargetSegment] = useState<number | null>(null)
  const [wheelSize, setWheelSize] = useState(getWheelSize)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const updateWheelSize = () => setWheelSize(getWheelSize())
    window.addEventListener('resize', updateWheelSize)
    return () => window.removeEventListener('resize', updateWheelSize)
  }, [])

  useEffect(() => {
    if (!reviewReturnDetected) return
    headingRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    headingRef.current?.focus({ preventScroll: true })
  }, [reviewReturnDetected])

  const isSpinning = spinStatus === 'spinning'
  const canSpin = !hasSpun && !isSpinning && !submitting && purchaseAmount !== null && purchaseAmount > 0

  const handleSpinRequested = useCallback(async () => {
    if (requestStarted.current || hasSpun || isSpinning || purchaseAmount === null || purchaseAmount <= 0) return
    requestStarted.current = true
    setSubmitting(true)
    setSubmissionError(null)
    try {
      const assignment = await dataProvider.createSubmission({
        storeSlug: store.slug,
        requestId: submissionRequestId,
        customerName: fullName,
        customerPhone: phoneNumber,
        purchaseAmount,
        reviewCtaShown,
        reviewCtaClicked,
      })
      const result = {
        amount: purchaseAmount,
        reward: assignment.reward,
        tier: assignment.tier,
        targetSegment: assignment.tier.targetSegment,
      }
      setSubmissionId(assignment.id)
      setClaimCode(assignment.claimCode)
      setRewardResult(result)
      if (!startSpin()) throw new Error('This spin has already been used.')
      setTargetSegment(result.targetSegment)
    } catch (error) {
      requestStarted.current = false
      setSubmissionError(error instanceof Error ? error.message : 'We could not save your entry. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [
    dataProvider,
    fullName,
    hasSpun,
    isSpinning,
    phoneNumber,
    purchaseAmount,
    reviewCtaClicked,
    reviewCtaShown,
    setClaimCode,
    setRewardResult,
    setSubmissionId,
    startSpin,
    store.slug,
    submissionRequestId,
  ])

  const handleSpinComplete = useCallback((finalRotation: number) => {
    completeSpin(finalRotation)
  }, [completeSpin])

  return (
    <div className="spin-win-content flex flex-col items-center text-center gap-5">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-bold text-ink">
        {reviewReturnDetected || isSpinning ? 'WELCOME BACK!' : 'YOUR REWARD IS READY'}
      </h2>
      <p className="font-body text-balance text-center text-sm text-muted max-w-xs">
        {reviewReturnDetected || isSpinning
          ? "Ready to see what you've won?"
          : 'Your purchase has unlocked a special reward.'}
      </p>

      {purchaseAmount != null && purchaseAmount > 0 && (
        <div className="rounded-xl bg-ink/4 px-4 py-2.5 text-center">
          <span className="block font-body text-xs uppercase tracking-wider text-muted">YOUR PURCHASE</span>
          <span className="font-display text-xl font-bold text-ink">{formatINR(purchaseAmount)}</span>
        </div>
      )}

      <SpinWheel
        segments={segments}
        targetSegment={targetSegment}
        isSpinning={isSpinning}
        onSpinComplete={handleSpinComplete}
        onSpinRequested={canSpin ? handleSpinRequested : undefined}
        size={wheelSize}
        disabled={!canSpin}
      />

      {reviewReturnDetected && !isSpinning && !hasSpun && (
        <PrimaryButton
          className="max-w-sm"
          disabled={!canSpin}
          onClick={handleSpinRequested}
        >
          Spin Now
        </PrimaryButton>
      )}

      {isSpinning && !canSpin && (
        <p className="font-body text-sm text-muted font-medium">Spinning… your reward is on its way!</p>
      )}

      {submitting && <p className="font-body text-sm text-muted">Saving your entry and assigning your reward…</p>}
      {submissionError && <p role="alert" className="max-w-sm text-sm text-red-700">{submissionError}</p>}

      {!isSpinning && !hasSpun && (
        <p className="font-body text-xs text-muted">Tap the SPIN button on the wheel</p>
      )}
    </div>
  )
}
