import { cn } from '@/lib/utils'

export function StoreLogo({
  logoUrl,
  className,
}: {
  logoUrl?: string | null
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Jewellery store logo"
          className="store-logo-image h-auto w-[180px] max-w-[58vw] object-contain"
          loading="eager"
        />
      )}
    </div>
  )
}
