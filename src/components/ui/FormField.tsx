import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function FormField({
  label,
  id,
  children,
  error,
  hint,
  className,
}: {
  label: string
  id?: string
  children: ReactNode
  error?: string | null
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-body text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <span className="font-body text-xs text-red-600 animate-fade-in" role="alert">
        {error}
      </span>}
      {hint && !error && <span className="font-body text-xs text-muted">{hint}</span>}
    </div>
  )
}
