import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  segmentAngle,
  polarToCartesian,
  computeTargetRotation,
  normalizeSpinDelta,
  normalizeAngle,
  animateSpin,
  displayLabel,
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
  /** Rim / separator highlight (defaults to the house gold). */
  rimColor?: string
  /** Pointer + hub accent (defaults to the house burgundy). */
  accentColor?: string
  /** Backdrop fill behind the rim (defaults to the house cream-gold). */
  ringFill?: string
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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Spin timing - pinned by tests. The spin animation runs for exactly 6 seconds
 * before the gift is revealed (plus the 400ms reveal settle). Customers who ask
 * their system for reduced motion still get the spin, just shorter and gentler.
 */
export const SPIN_DURATION_MS = 5000
export const SPIN_FULL_SPINS = 8
export const SPIN_REDUCED_MOTION_DURATION_MS = 3000
export const SPIN_REDUCED_MOTION_FULL_SPINS = 4
export const SPIN_REVEAL_SETTLE_MS = 400

export function SpinWheel({
  segments,
  targetSegment,
  isSpinning,
  onSpinComplete,
  onSpinRequested,
  size = 360,
  disabled = false,
  rimColor = 'hsl(39 42% 68%)',
  accentColor = 'hsl(350 48% 27%)',
  ringFill = 'hsl(39 34% 94%)',
}: SpinWheelProps) {
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(rotation)
  const controllerRef = useRef<SpinController | null>(null)
  const completedRef = useRef(false)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [landedSegment, setLandedSegment] = useState<number | null>(null)
  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])
  const cx = size / 2
  const cy = size / 2
  const R_outer = cx - 12
  const R_inner = cx - 82
  const labelRadius = (R_inner + R_outer) / 2
  const buttonDiameter = Math.min(88, Math.max(68, size * 0.22))
  const buttonRadius = buttonDiameter / 2 - 4
  const segAngle = segmentAngle(segments.length)
  const canSpin = !isSpinning && targetSegment === null && !disabled && onSpinRequested !== undefined
  // WCAG 2.5.3 (Label in Name): the wheel's accessible name must contain the
  // text visibly drawn on its slices, so assistive tech announces the prizes
  // the customer can actually see.
  const visibleLabels = Array.from(
    new Set(segments.map((seg) => displayLabel(seg.rewardName, segments.length).join(' '))),
  ).join(', ')

  useEffect(() => {
    if (targetSegment === null) return
    if (completedRef.current) return

    const startAngle = rotationRef.current
    setLandedSegment(null)
    // The spin is the heart of Spin & Win: the wheel always visibly rotates
    // for a few seconds before the gift is revealed. Customers who ask their
    // system for reduced motion still get the spin, just shorter and gentler
    // instead of an instant snap.
    const { finalRotation, durationMs, fullSpins } = computeTargetRotation(
      targetSegment,
      segments.length,
      prefersReducedMotion()
        ? { fullSpins: SPIN_REDUCED_MOTION_FULL_SPINS, durationMs: SPIN_REDUCED_MOTION_DURATION_MS }
        : { fullSpins: SPIN_FULL_SPINS, durationMs: SPIN_DURATION_MS },
    )
    const targetAngle = startAngle + normalizeSpinDelta(startAngle, finalRotation, fullSpins)

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
        setLandedSegment(targetSegment)
        resultTimerRef.current = setTimeout(() => {
          onSpinComplete(targetAngle)
          resultTimerRef.current = null
        }, SPIN_REVEAL_SETTLE_MS)
      },
    )

    return () => {
      controllerRef.current?.cancel()
      if (resultTimerRef.current) {
        clearTimeout(resultTimerRef.current)
        resultTimerRef.current = null
      }
    }
  }, [targetSegment, segments.length, onSpinComplete])

  const handleSpin = () => {
    if (canSpin && onSpinRequested) onSpinRequested()
  }

  return (
    <div
      className="relative mx-auto aspect-square"
      style={{ width: `min(${size}px, 100%, calc(100vw - 48px))` }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={visibleLabels ? `Spin wheel showing ${visibleLabels}` : 'Spin wheel'}
        className={cn(
          'wheel',
          'absolute inset-0 h-full w-full',
          'pointer-events-none',
          isSpinning && 'spinning',
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
          <circle cx={0} cy={0} r={R_outer + 5} fill={ringFill} stroke={rimColor} strokeWidth={5} />
          <circle cx={0} cy={0} r={R_outer + 1} fill="none" stroke={accentColor} strokeWidth={1.5} />
          <g
            className="wheel-rotor"
            transform={`rotate(${rotation})`}
          >
            {segments.map((seg) => {
              const start = seg.index * segAngle
              const end = start + segAngle
              const center = (start + end) / 2
              const mid = polarToCartesian(0, 0, labelRadius, center)
              const flipped = center > 90 && center < 270
              const rotationDeg = flipped ? center + 180 : center
              const lines = displayLabel(seg.rewardName, segments.length)
              const labelFontSize = lines.length > 3 ? 10 : segments.length > 9 ? 10 : 12
              // Vertically centre the whole label block inside the slice band.
              const firstBaseline =
                mid.y - ((lines.length - 1) * (labelFontSize + 1)) / 2 + labelFontSize * 0.35
              return (
                <g
                  key={seg.index}
                  className={cn('wheel-segment', landedSegment === seg.index && 'wheel-segment-won')}
                >
                  <path
                    d={describeAnnulus(0, 0, R_inner, R_outer, start, end)}
                    fill={seg.color}
                    stroke={rimColor}
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                  />
                  <path d={describeAnnulus(0, 0, R_inner, R_outer, start, end)} fill="url(#wheel-gloss)" opacity={0.55} />
                  <text
                    x={mid.x}
                    y={firstBaseline}
                    transform={`rotate(${rotationDeg} ${mid.x} ${mid.y})`}
                    textAnchor="middle"
                    fontSize={labelFontSize}
                    fontWeight={600}
                    letterSpacing={0.15}
                    aria-label={lines.join(' ')}
                    fill="hsl(40 33% 99%)"
                    paintOrder="stroke"
                    stroke="rgba(35, 22, 20, 0.58)"
                    strokeWidth={0.7}
                  >
                    {lines.map((line, lineIndex) => (
                      <tspan
                        key={`${seg.index}-${lineIndex}`}
                        x={mid.x}
                        dy={lineIndex === 0 ? 0 : labelFontSize + 1}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            })}
          </g>
          <circle cx={0} cy={0} r={buttonRadius + 4} fill="none" stroke={rimColor} strokeWidth={3} />
          <circle cx={0} cy={0} r={R_inner} fill="none" stroke={rimColor} strokeOpacity={0.8} strokeWidth={1.5} />
          <circle cx={0} cy={0} r={buttonRadius + 10} fill="none" stroke={rimColor} strokeOpacity={0.7} strokeWidth={1} />
        </g>

        <g transform={`translate(${cx} ${cy})`}>
          <g className={cn('wheel-pointer', isSpinning && 'wheel-pointer-spinning')}>
            <polygon points={`${-22},${-R_outer - 12} ${22},${-R_outer - 12} 0,${-R_outer + 19 - 12}`} fill={accentColor} stroke={rimColor} strokeWidth={2.5} />
            <circle cx={0} cy={-R_outer - 8} r={3} fill={rimColor} />
          </g>
        </g>
      </svg>

      <button
        type="button"
        className={cn(
          'spin-center',
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10',
          'flex items-center justify-center rounded-full text-paper font-semibold tracking-wider',
          'transition-[transform,background-color,box-shadow] duration-200 ease-out active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          canSpin
            ? 'cursor-pointer hover:brightness-110 hover:shadow-md'
            : 'cursor-default opacity-70',
        )}
        style={{
          width: `${(buttonDiameter / size) * 100}%`,
          height: `${(buttonDiameter / size) * 100}%`,
        }}
        disabled={!canSpin}
        onClick={handleSpin}
        aria-label={isSpinning ? 'Spinning...' : 'Spin the wheel'}
      >
        {isSpinning ? (
        <span className="pointer-events-none text-[10px] uppercase">Spinning...</span>
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
