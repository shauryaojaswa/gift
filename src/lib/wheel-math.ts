const TWO_PI = Math.PI * 2

export function segmentAngle(segmentCount: number): number {
  return 360 / segmentCount
}

export function segmentCenterDegrees(segmentIndex: number, segmentCount: number): number {
  return segmentIndex * segmentAngle(segmentCount) + segmentAngle(segmentCount) / 2
}

export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleDegrees: number,
): { x: number; y: number } {
  const angleRad = (angleDegrees - 90) * (Math.PI / 180)
  return {
    x: centerX + radius * Math.cos(angleRad),
    y: centerY + radius * Math.sin(angleRad),
  }
}

export function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngleDegrees: number,
  endAngleDegrees: number,
): string {
  const start = polarToCartesian(centerX, centerY, radius, endAngleDegrees)
  const end = polarToCartesian(centerX, centerY, radius, startAngleDegrees)
  const largeArc = endAngleDegrees - startAngleDegrees <= 180 ? 0 : 1
  return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export interface SpinOptions {
  fullSpins?: number
  offsetFraction?: number
  durationMs?: number
}

export interface SpinResult {
  finalRotation: number
  targetRotation: number
  segmentCount: number
  durationMs: number
  fullSpins: number
}

export function computeTargetRotation(
  targetSegment: number,
  segmentCount: number,
  options: SpinOptions = {},
): SpinResult {
  const fullSpins = options.fullSpins ?? 5
  const offsetFraction = options.offsetFraction ?? 0.5
  const segAngle = segmentAngle(segmentCount)
  const start = targetSegment * segAngle
  const offset = offsetFraction * segAngle
  const targetRotation = fullSpins * 360 + normalizeAngle(-(start + offset))
  return {
    finalRotation: targetRotation,
    targetRotation,
    segmentCount,
    durationMs: options.durationMs ?? 4800,
    fullSpins,
  }
}

export function normalizeSpinDelta(
  currentAngle: number,
  targetRotation: number,
  minSpins: number,
): number {
  const segDelta = normalizeAngle(targetRotation - currentAngle)
  return segDelta + minSpins * 360
}

export function spinEase(t: number): number {
  const acceleration = 0.2
  const peakProgress = 0.4
  if (t <= 0) return 0
  if (t >= 1) return 1
  if (t < acceleration) {
    const s = t / acceleration
    return peakProgress * s * s
  }
  const s = (t - acceleration) / (1 - acceleration)
  const k = 1 - s
  return peakProgress + (1 - peakProgress) * (1 - k * k * k * k)
}

export interface SpinController {
  cancel: () => void
  currentAngle: () => number
  isRunning: () => boolean
}

export function animateSpin(
  startAngle: number,
  targetAngle: number,
  durationMs: number,
  onFrame: (angle: number) => void,
  onComplete: () => void,
): SpinController {
  let running = true
  let rafId = 0
  let current = startAngle
  onFrame(startAngle)
  const startTime = performance.now()

  const step = (now: number) => {
    if (!running) return
    const elapsed = now - startTime
    const t = Math.min(elapsed / durationMs, 1)
    const eased = spinEase(t)
    current = startAngle + (targetAngle - startAngle) * eased
    onFrame(current)
    if (t < 1) {
      rafId = requestAnimationFrame(step)
    } else {
      onFrame(targetAngle)
      running = false
      onComplete()
    }
  }

  rafId = requestAnimationFrame(step)

  const cancel = () => {
    running = false
    cancelAnimationFrame(rafId)
  }

  return {
    cancel,
    currentAngle: () => current,
    isRunning: () => running,
  }
}

export { TWO_PI }
