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
    durationMs: options.durationMs ?? 6000,
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
  const acceleration = 0.12
  const peakProgress = (2 * acceleration) / (1 + acceleration)
  if (t <= 0) return 0
  if (t >= 1) return 1
  if (t < acceleration) {
    const s = t / acceleration
    return peakProgress * s * s * (2 - s)
  }
  const s = (t - acceleration) / (1 - acceleration)
  const remaining = 1 - s
  return peakProgress + (1 - peakProgress) * (1 - remaining * remaining)
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

export function displayLabel(name: string, segmentCount: number): string[] {
  const normalized = name.toUpperCase().trim()

  // Spec-mandated concise wheel labels — kept separate from the full reward
  // name that the reveal screen shows. Checked before the generic voucher rule
  // so abbreviated forms (₹1K, ₹2.5K, ₹5K) win over "₹1,000" style.
  const conciseLabels: Record<string, string[]> = {
    'JEWELLERY CLEANING': ['CLEANING'],
    'PREMIUM GIFT': ['PREMIUM', 'GIFT'],
    'SILVER GIFT': ['SILVER', 'GIFT'],
    '₹1,000 VOUCHER': ['₹1K', 'VOUCHER'],
    '₹2,500 VOUCHER': ['₹2.5K', 'VOUCHER'],
    '₹5,000 VOUCHER': ['₹5K', 'VOUCHER'],
  }
  if (conciseLabels[normalized]) return conciseLabels[normalized]

  const voucherAmount = normalized.match(/^(₹[\d,]+)\s+VOUCHER$/)
  if (voucherAmount) return [voucherAmount[1], 'VOUCHER']

  // Prize bundles (e.g. "Bag + ₹1,200 Saree Coupon"): the wheel wraps the
  // COMPLETE bundle name across its lines (13 chars each) so every component -
  // including the coupon - stays visible; nothing is abbreviated or concealed.
  // The reward reveal and the vendor collection record show the same complete
  // name.
  if (normalized.includes(' + ')) {
    const bundleLines: string[] = []
    let bundleLine = ''
    for (const word of normalized.split(/\s+/)) {
      const candidate = bundleLine ? `${bundleLine} ${word}` : word
      if (candidate.length <= 13) {
        bundleLine = candidate
      } else {
        if (bundleLine) bundleLines.push(bundleLine)
        bundleLine = word
      }
    }
    if (bundleLine) bundleLines.push(bundleLine)
    return bundleLines
  }

  const maxPerLine = segmentCount > 9 ? 7 : 10
  const words = normalized.split(/\s+/)
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
