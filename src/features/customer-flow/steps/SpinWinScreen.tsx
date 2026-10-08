import { useState, useMemo, useCallback, useEffect } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { SpinWheel } from '@/components/ui/SpinWheel'
import { buildSegments, evaluateReward } from '@/lib/reward-engine'
import { formatINR } from '@/lib/currency'
import type { WheelSegment } from '@/types'

function getWheelSize(): number {
  if (typeof window === 'undefined') return 360
  return Math.max(180, Math.min(420, window.innerWidth - 64, window.innerHeight - 520))
}

export function SpinWinScreen() {
  const store = useStoreConfigValue()
  const {
    purchaseAmount,
    hasSpun,
    spinStatus,
    setRewardResult,
    startSpin,
    completeSpin,
  } = useCustomerFlow((s) => ({
    purchaseAmount: s.purchaseAmount,
    hasSpun: s.hasSpun,
    spinStatus: s.spinStatus,
    setRewardResult: s.setRewardResult,
    startSpin: s.startSpin,
    completeSpin: s.completeSpin,
  }))

  const segments: WheelSegment[] = useMemo(() => buildSegments(store), [store])
  const [targetSegment, setTargetSegment] = useState<number | null>(null)
  const [wheelSize, setWheelSize] = useState(getWheelSize)

  useEffect(() => {
    const updateWheelSize = () => setWheelSize(getWheelSize())
    window.addEventListener('resize', updateWheelSize)
    return () => window.removeEventListener('resize', updateWheelSize)
  }, [])

  const isSpinning = spinStatus === 'spinning'
  const canSpin = !hasSpun && !isSpinning && purchaseAmount !== null && purchaseAmount > 0

  const handleSpinRequested = useCallback(() => {
    if (hasSpun || isSpinning || purchaseAmount === null || purchaseAmount <= 0) return
    const result = evaluateReward(purchaseAmount, store)
    if (!result) return
    if (!startSpin()) return
    setRewardResult(result)
    setTargetSegment(result.targetSegment)
  }, [hasSpun, isSpinning, purchaseAmount, store, setRewardResult, startSpin])

  const handleSpinComplete = useCallback((finalRotation: number) => {
    completeSpin(finalRotation)
  }, [completeSpin])

  return (
    <div className="spin-win-content flex flex-col items-center text-center gap-5">
      {store.campaignBadge && (
        <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
          {store.campaignBadge}
        </span>
      )}
      <h2 className="font-display text-3xl font-bold text-ink">YOUR REWARD IS READY</h2>
      <p className="font-body text-balance text-center text-sm text-muted max-w-xs">
        Your purchase has unlocked a special reward.
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

      {isSpinning && !canSpin && (
        <p className="font-body text-sm text-muted font-medium">Spinning… your reward is on its way!</p>
      )}

      {!isSpinning && !hasSpun && (
        <p className="font-body text-xs text-muted">Tap the SPIN button on the wheel</p>
      )}
    </div>
  )
}
