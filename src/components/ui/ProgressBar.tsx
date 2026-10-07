
interface ProgressBarProps {
  progress: number
  color?: string
  label?: string
}

export function ProgressBar({ progress, color, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, progress * 100))
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="font-body text-xs text-muted">{label}</span>
          <span className="font-body text-xs text-muted">{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            backgroundColor: color ?? 'var(--brand)',
          }}
        />
      </div>
    </div>
  )
}
