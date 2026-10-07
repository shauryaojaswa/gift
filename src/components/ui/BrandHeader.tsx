import { cn } from '@/lib/utils'
import { StoreLogo } from '@/components/ui/StoreLogo'

export function BrandHeader({
  subtitle,
  logoUrl,
  className,
  size = 'md',
}: {
  subtitle?: string | null
  logoUrl?: string | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const imgSrc = logoUrl ?? '/assets/brand-logo.png'
  const textSize = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }[size]
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <StoreLogo logoUrl={imgSrc} />
      <div className="flex flex-col items-center">
        {subtitle && (
          <span className={cn('font-body font-medium text-muted uppercase tracking-[0.15em]', textSize)}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
