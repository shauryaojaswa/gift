import { Link } from 'react-router-dom'

/**
 * Designed not-found page. Shown for unknown shop slugs and unrouted paths.
 * Never falls back to loading a different shop.
 */
export default function NotFound({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 py-16 text-center">
      <p className="font-display text-6xl font-bold tracking-tight text-brand">404</p>
      <h1 className="font-display text-2xl font-bold text-ink">Page not found</h1>
      <p className="max-w-md text-balance text-muted">
        {message ??
          'This address does not match a JRIQ page. If you scanned a QR code, check that the link is complete.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="btn-primary">
          Go to the JRIQ homepage
        </Link>
      </div>
      <p className="text-xs text-muted">
        Shop pages live at <span className="font-medium text-ink">jriq.in/&lt;shop&gt;</span> — every
        printed QR code carries its shop&apos;s address.
      </p>
    </div>
  )
}
