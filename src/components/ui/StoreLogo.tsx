import { useState } from 'react'
import { cn } from '@/lib/utils'
import { isRenderableLogo } from '@/lib/logo-upload'
import { LogoFallback } from './LogoFallback'

// Resolve a stored asset path against the deployment base so one build works
// both at a site root (Vercel, base "/") and under a subpath such as GitHub
// Pages "/gift/". Absolute URLs and data URLs are returned untouched.
export function resolveAssetUrl(logoUrl: string): string {
  if (/^(https?:)?\/\//.test(logoUrl) || logoUrl.startsWith('data:') || logoUrl.startsWith('blob:')) {
    return logoUrl
  }
  const base = import.meta.env.BASE_URL // always ends with "/"
  const withoutLeadingSlash = logoUrl.replace(/^\.?\//, '')
  return base + withoutLeadingSlash
}

/**
 * Shop logo with a designed fallback: missing, placeholder or broken logo
 * URLs render the themed monogram for THIS shop (never another shop's mark).
 * The failure state is tracked per URL, so navigating between shops cannot
 * leak one shop's fallback into the next.
 */
export function StoreLogo({
  logoUrl,
  name,
  alt,
  className,
}: {
  logoUrl?: string | null
  name?: string | null
  alt?: string
  className?: string
}) {
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const cleaned = (logoUrl ?? '').trim()
  const failed = failedFor === cleaned
  const showImage = isRenderableLogo(cleaned) && !failed

  return (
    <div className={cn('flex items-center justify-center', className)}>
      {showImage ? (
        <img
          key={cleaned}
          src={resolveAssetUrl(cleaned)}
          alt={alt ?? name ?? 'Store logo'}
          className="store-logo-image h-auto w-[180px] max-w-[58vw] object-contain"
          loading="eager"
          onError={() => setFailedFor(cleaned)}
        />
      ) : (
        <LogoFallback name={name ?? alt ?? null} />
      )}
    </div>
  )
}
