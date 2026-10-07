import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

export function PrimaryButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  ...props
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'tap-target inline-flex w-full items-center justify-center rounded-full font-medium transition-all duration-200 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-brand hover:bg-brandHover text-paper focus-visible:ring-brand/40',
    secondary: 'bg-secondary hover:bg-secondary/85 text-paper focus-visible:ring-secondary/40',
    outline: 'border border-border-soft bg-transparent hover:bg-border-soft text-ink focus-visible:ring-brand/40',
  }
  const sizes = {
    sm: 'text-sm py-2.5 px-5',
    md: 'text-base py-3.5 px-6',
    lg: 'text-lg py-4 px-8',
  }
  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-label="loading">
          <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : null}
      {children}
    </button>
  )
}
