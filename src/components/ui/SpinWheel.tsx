import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  segmentAngle,
  polarToCartesian,
  computeTargetRotation,
  normalizeSpinDelta,
  normalizeAngle,
  animateSpin,
} from '@/lib/wheel-math'
import type { SpinController } from '@/lib/wheel-math'
import type { WheelSegment } from '@/types'

interface SpinWheelProps {
  segments: WheelSegment[]
  targetSegment: number | null
  isSpinning: boolean
  onSpinComplete: (finalRotation: number) => void
  onSpinRequested?: () => void
  size?: number
  disabled?: boolean
}

function describeAnnulus(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const p1 = polarToCartesian(cx, cy, rOuter, startDeg)
  const p2 = polarToCartesian(cx, cy, rOuter, endDeg)
  const p3 = polarToCartesian(cx, cy, rInner, endDeg)
  const p4 = polarToCartesian(cx, cy, rInner, startDeg)
  const span = endDeg - startDeg
  const largeArc = span > 180 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`
}

function truncateLabel(name: string, max = 24): string {
  return name.length > max ? `${name.slice(0, max - 1).trim()}…` : name.toUpperCase()
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SpinWheel({
  segments,
  targetSegment,
  isSpinning,
  onSpinComplete,
  onSpinRequested,
  size = 360,
  disabled = false,
}: SpinWheelProps) {
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(rotation)
  const controllerRef = useRef<SpinController | null>(null)
  const completedRef = useRef(false)
  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])
  const cx = size / 2
  const cy = size / 2
  const R_outer = cx - 12
  const R_inner = cx - 82
  const labelRadius = (R_inner + R_outer) / 2 + 6
  const buttonDiameter = Math.min(82, Math.max(64, size * 0.28))
  const buttonRadius = buttonDiameter / 2 - 4
  const segAngle = segmentAngle(segments.length)
  const canSpin = !isSpinning && targetSegment === null && !disabled && onSpinRequested !== undefined

  useEffect(() => {
    if (targetSegment === null) return
    if (completedRef.current) return

    const startAngle = rotationRef.current
    const { finalRotation, durationMs, fullSpins } = computeTargetRotation(targetSegment, segments.length)
    const targetAngle = startAngle + normalizeSpinDelta(startAngle, finalRotation, fullSpins)

    if (prefersReducedMotion()) {
      setRotation(normalizeAngle(targetAngle))
      completedRef.current = true
      onSpinComplete(targetAngle)
      return
    }

    controllerRef.current?.cancel()
    controllerRef.current = animateSpin(
      startAngle,
      targetAngle,
      durationMs,
      (angle) => setRotation(normalizeAngle(angle)),
      () => {
        setRotation(normalizeAngle(targetAngle))
        completedRef.current = true
        controllerRef.current = null
        onSpinComplete(targetAngle)
      },
    )

    return () => {
      controllerRef.current?.cancel()
    }
  }, [targetSegment, segments.length, onSpinComplete])

  const handleSpin = () => {
    if (canSpin && onSpinRequested) onSpinRequested()
  }

  return (
    <div
      className="relative mx-auto aspect-square"
      style={{ width: `min(${size}px, calc(100vw - 80px))` }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Win wheel with ${segments.length} rewards`}
        className={cn(
          'wheel',
          'absolute inset-0 h-full w-full drop-shadow-xl',
          'pointer-events-none',
          isSpinning && 'spinning drop-shadow-[0_0_28px_hsl(40_80%_56%/0.55)]',
          !isSpinning && canSpin && 'spin-idle',
        )}
      >
        <defs>
          <linearGradient id="wheel-gloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={0.18} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
        </defs>

        <g transform={`translate(${cx} ${cy})`}>
          <circle cx={0} cy={0} r={R_outer + 5} fill="hsl(48 60% 88%)" stroke="hsl(40 80% 56%)" strokeWidth={3} />
          <g
            className="wheel-rotor"
            transform={`rotate(${rotation})`}
          >
            {segments.map((seg) => {
              const start = seg.index * segAngle
              const end = start + segAngle
              const center = (start + end) / 2
              const mid = polarToCartesian(0, 0, labelRadius, center)
              const flipped = center > 180 && center < 360
              const rotationDeg = flipped ? center + 180 : center
              return (
                <g key={seg.index} className="wheel-segment">
                  <path
                    d={describeAnnulus(0, 0, R_inner, R_outer, start, end)}
                    fill={seg.color}
                    stroke="hsl(40 80% 56%/0.45)"
                    strokeWidth={1.5}
                  />
                  <path d={describeAnnulus(0, 0, R_inner, R_outer, start, end)} fill="url(#wheel-gloss)" opacity={0.55} />
                  <text
                    x={mid.x}
                    y={mid.y + 4}
                    transform={`rotate(${rotationDeg} ${mid.x} ${mid.y})`}
                    textAnchor="middle"
                    fontSize={size < 240 ? 9 : 11}
                    fontWeight={700}
                    fill="white"
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={0.4}
                  >
                    {truncateLabel(seg.rewardName)}
                  </text>
                </g>
              )
            })}
          </g>
          <circle cx={0} cy={0} r={buttonRadius + 4} fill="none" stroke="hsl(40 80% 56%)" strokeWidth={3} />
        </g>

        <g transform={`translate(${cx} ${cy})`} className="wheel-pointer">
          <polygon points={`${-20},${-R_outer - 12} ${20},${-R_outer - 12} 0,${-R_outer + 16 - 12}`} fill="hsl(355 85% 45%)" stroke="hsl(40 80% 56%)" strokeWidth={2} />
        </g>
      </svg>

      <button
        type="button"
        className={cn(
          'spin-center',
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10',
          'flex items-center justify-center rounded-full text-white font-extrabold tracking-wider',
          'transition-all duration-200 ease-out active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          canSpin
            ? 'cursor-pointer hover:brightness-110'
            : 'cursor-default opacity-70',
        )}
        style={{
          width: `${(buttonDiameter / size) * 100}%`,
          height: `${(buttonDiameter / size) * 100}%`,
        }}
        disabled={!canSpin}
        onClick={handleSpin}
        aria-label={canSpin ? 'Spin the wheel' : 'Spinning'}
      >
        {isSpinning ? (
          <span className="pointer-events-none text-xs uppercase">SPINNING…</span>
        ) : (
          <>
            <span className="pointer-events-none block text-xs leading-none">▲</span>
            <span className="pointer-events-none block text-xl leading-none">SPIN</span>
          </>
        )}
      </button>
    </div>
  )
}
