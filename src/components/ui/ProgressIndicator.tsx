import { cn } from '@/lib/utils'
import type { FlowState } from '@/types'

const STEPS: { label: string; key: FlowState }[] = [
  { label: 'DETAILS', key: 'DETAILS' },
  { label: 'REVIEW', key: 'REVIEW_INVITATION' },
  { label: 'SPIN', key: 'SPIN' },
  { label: 'REWARD', key: 'REWARD' },
]

function stageOf(step: FlowState): number {
  switch (step) {
    case 'WELCOME':
      return 0
    case 'DETAILS':
      return 1
    case 'REVIEW_INVITATION':
      return 2
    case 'SPIN':
    case 'SPINNING':
      return 3
    case 'REWARD':
      return 4
    case 'THANK_YOU':
    case 'COMPLETE':
      return 4
    default:
      return 0
  }
}

export function ProgressIndicator({ step }: { step: FlowState }) {
  const stage = stageOf(step)
  return (
    <div className="w-full" aria-label="Customer reward progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Customer reward progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={stage}
      >
        <div
          className="progress-fill bg-brand"
          style={{ width: `${(stage / STEPS.length) * 100}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {STEPS.map((s, i) => {
        const active = stage >= i + 1
        return (
          <span key={s.label} className="flex min-w-0 flex-col items-center gap-1">
            <span
              className={cn(
                'flex h-2 w-2 items-center justify-center rounded-full transition-colors',
                active ? 'bg-brand' : 'bg-border-soft',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'whitespace-nowrap font-body text-[9px] font-medium uppercase tracking-[0.08em]',
                active ? 'text-brand' : 'text-muted',
              )}
            >
              {s.label}
            </span>
          </span>
        )
        })}
      </div>
    </div>
  )
}
