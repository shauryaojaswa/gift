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

function displayLabel(name: string, maxPerLine: number): string[] {
  const words = name.toUpperCase().trim().split(/\s+/)
  const lines: string[] = []
  let line = ''
  let wasTruncated = false

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= maxPerLine) {
      line = candidate
    } else {
      if (lines.length === 0) {
        if (line) lines.push(line)
        line = word.length > maxPerLine ? word.slice(0, maxPerLine) : word
        wasTruncated = word.length > maxPerLine
      } else {
        wasTruncated = true
        break
      }
    }
  }

  if (line) {
    if (lines.length < 2) lines.push(line)
    else wasTruncated = true
  }
  if (wasTruncated && lines.length > 0) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, maxPerLine - 1)}…`
  return lines
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
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [landedSegment, setLandedSegment] = useState<number | null>(null)
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
    setLandedSegment(null)
    const { finalRotation, durationMs, fullSpins } = computeTargetRotation(
      targetSegment,
      segments.length,
      { fullSpins: 6, durationMs: 6000 },
    )
    const targetAngle = startAngle + normalizeSpinDelta(startAngle, finalRotation, fullSpins)

    if (prefersReducedMotion()) {
      setRotation(normalizeAngle(targetAngle))
      completedRef.current = true
      setLandedSegment(targetSegment)
      resultTimerRef.current = setTimeout(() => {
        onSpinComplete(targetAngle)
        resultTimerRef.current = null
      }, 400)
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
        setLandedSegment(targetSegment)
        resultTimerRef.current = setTimeout(() => {
          onSpinComplete(targetAngle)
          resultTimerRef.current = null
        }, 400)
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
      style={{ width: `min(${size}px, calc(100vw - 64px))` }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Win wheel with ${segments.length} rewards`}
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
          <circle cx={0} cy={0} r={R_outer + 5} fill="hsl(39 34% 94%)" stroke="hsl(39 34% 59%)" strokeWidth={4} />
          <circle cx={0} cy={0} r={R_outer + 1} fill="none" stroke="hsl(350 48% 27%)" strokeWidth={1.5} />
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
              const lines = displayLabel(seg.rewardName, segments.length > 9 ? 10 : 14)
              const labelFontSize = segments.length > 9 ? 11 : 13
              return (
                <g
                  key={seg.index}
                  className={cn('wheel-segment', landedSegment === seg.index && 'wheel-segment-won')}
                >
                  <path
                    d={describeAnnulus(0, 0, R_inner, R_outer, start, end)}
                    fill={seg.color}
                    stroke="hsl(39 34% 59%/0.55)"
                    strokeWidth={1.5}
                  />
                  <path d={describeAnnulus(0, 0, R_inner, R_outer, start, end)} fill="url(#wheel-gloss)" opacity={0.55} />
                  <text
                    x={mid.x}
                    y={mid.y + (lines.length > 1 ? -1 : 4)}
                    transform={`rotate(${rotationDeg} ${mid.x} ${mid.y})`}
                    textAnchor="middle"
                    fontSize={labelFontSize}
                    fontWeight={600}
                    letterSpacing={0.15}
                    fill="hsl(40 33% 99%)"
                    paintOrder="stroke"
                    stroke="rgba(35, 22, 20, 0.58)"
                    strokeWidth={0.7}
                  >
                    {lines.map((line, lineIndex) => (
                      <tspan key={`${seg.index}-${lineIndex}`} x={mid.x} dy={lineIndex === 0 ? 0 : labelFontSize + 1}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            })}
          </g>
          <circle cx={0} cy={0} r={buttonRadius + 4} fill="none" stroke="hsl(39 34% 59%)" strokeWidth={3} />
          <circle cx={0} cy={0} r={R_inner} fill="none" stroke="hsl(39 34% 74%)" strokeWidth={1.5} />
          <circle cx={0} cy={0} r={buttonRadius + 10} fill="none" stroke="hsl(39 34% 59%/0.7)" strokeWidth={1} />
        </g>

        <g transform={`translate(${cx} ${cy})`}>
          <g className={cn('wheel-pointer', isSpinning && 'wheel-pointer-spinning')}>
            <polygon points={`${-22},${-R_outer - 12} ${22},${-R_outer - 12} 0,${-R_outer + 19 - 12}`} fill="hsl(350 48% 27%)" stroke="hsl(39 34% 59%)" strokeWidth={2.5} />
            <circle cx={0} cy={-R_outer - 8} r={3} fill="hsl(39 34% 78%)" />
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
        aria-label={canSpin ? 'Spin the wheel' : 'Spinning...'}
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
