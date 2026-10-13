import { cn } from '@/lib/utils'

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
          src={resolveAssetUrl(logoUrl)}
          alt="Jewellery store logo"
          className="store-logo-image h-auto w-[180px] max-w-[58vw] object-contain"
          loading="eager"
        />
      )}
    </div>
  )
}
