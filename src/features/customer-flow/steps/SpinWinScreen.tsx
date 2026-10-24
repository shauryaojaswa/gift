import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { SpinWheel } from '@/components/ui/SpinWheel'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { buildShopTheme, hslToString } from '@/lib/theme'
import {
  buildWheelOptions,
  buildWheelSegments,
  landingSegmentIndex,
} from '@/lib/reward-engine'
import { formatINR } from '@/lib/currency'
import type { WheelSegment } from '@/types'

export function getWheelSize(): number {
  if (typeof window === 'undefined') return 360
  return Math.max(220, Math.min(420, window.innerWidth - 48))
}

/**
 * The reward is already persisted at details-submit (persist-first). This
 * screen only animates the wheel to the slice carrying the saved reward - no
 * RPC runs at spin time and the reveal always matches the stored claim.
 */
export function SpinWinScreen() {
  const store = useStoreConfigValue()
  const {
    purchaseAmount,
    hasSpun,
    spinStatus,
    reviewReturnDetected,
    rewardResult,
    startSpin,
    completeSpin,
    setStep,
  } = useCustomerFlow((s) => ({
    purchaseAmount: s.purchaseAmount,
    hasSpun: s.hasSpun,
    spinStatus: s.spinStatus,
    reviewReturnDetected: s.reviewReturnDetected,
    rewardResult: s.rewardResult,
    startSpin: s.startSpin,
    completeSpin: s.completeSpin,
    setStep: s.setStep,
  }))

  const theme = useMemo(
    () => buildShopTheme(store.primaryColor, store.secondaryColor),
    [store.primaryColor, store.secondaryColor],
  )

  // The wheel advertises EVERY gift this shop awards - the customer can see
  // they could win any of them - and the purchase amount decides the actual
  // prize. Whatever was saved at details-submit wins: the wheel stops exactly
  // on the engine-assigned slice and its label is the saved snapshot.
  const { segments, landing } = useMemo(() => {
    if (!rewardResult) return { segments: [] as WheelSegment[], landing: -1 }
    const options = buildWheelOptions(store, rewardResult)
    const segs = buildWheelSegments(options, rewardResult, theme.wheelPalette)
    return { segments: segs, landing: landingSegmentIndex(segs, rewardResult) }
  }, [store, rewardResult, theme.wheelPalette])

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
  const canSpin = !hasSpun && !isSpinning && rewardResult !== null && segments.length > 0

  const handleSpinRequested = useCallback(() => {
    if (!startSpin()) return
    setTargetSegment(landing)
  }, [startSpin, landing])

  const handleSpinComplete = useCallback(
    (finalRotation: number) => {
      completeSpin(finalRotation)
    },
    [completeSpin],
  )

  // Without a saved reward there is nothing to spin for: never offer a spin
  // the backend cannot honour.
  if (!rewardResult || segments.length === 0) {
    return (
      <div className="spin-win-content flex flex-col items-center text-center gap-5">
        <h2 className="font-display text-3xl font-bold text-ink">YOUR REWARD IS NOT READY</h2>
        <p className="font-body text-balance text-center text-sm text-muted max-w-xs">
          We could not restore your saved reward. Please continue to re-enter your details — your
          entry reference makes sure nothing is lost.
        </p>
        <PrimaryButton className="max-w-sm" onClick={() => setStep('DETAILS')}>
          BACK TO DETAILS
        </PrimaryButton>
      </div>
    )
  }

  return (
    <div className="spin-win-content flex flex-col items-center text-center gap-5">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-bold text-ink">
        {reviewReturnDetected ? 'WELCOME BACK!' : 'YOUR REWARD IS READY'}
      </h2>
      <p className="font-body text-balance text-center text-sm text-muted max-w-xs">
        {reviewReturnDetected
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
        spinDurationMs={store.spinDurationMs}
        rimColor={theme.wheelStroke}
        accentColor={hslToString(theme.primary)}
        ringFill={hslToString({ h: theme.secondary.h, s: theme.secondary.s * 0.5, l: 0.94 })}
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

      {isSpinning && (
        <p className="font-body text-sm text-muted font-medium">Spinning… your reward is on its way!</p>
      )}

      {!isSpinning && !hasSpun && (
        <p className="font-body text-xs text-muted">Tap the SPIN button on the wheel</p>
      )}
    </div>
  )
}
