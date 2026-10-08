import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { configuredGoogleReviewUrl } from '@/lib/google-review'

export function GoogleReviewQrCode() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const reviewLink = configuredGoogleReviewUrl(null)
  const [error, setError] = useState<string | null>(reviewLink.error)

  useEffect(() => {
    let cancelled = false
    if (!reviewLink.url) return

    QRCode.toDataURL(reviewLink.url, {
      width: 220,
      margin: 2,
      color: { dark: '#49252d', light: '#fffdf9' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setError('The review QR code could not be created. Please try again.')
      })

    return () => {
      cancelled = true
    }
  }, [reviewLink.url, reviewLink.error])

  return (
    <section
      aria-labelledby="review-qr-heading"
      className="flex w-full flex-col items-center gap-3 border-t border-border-soft pt-5 text-center"
    >
      <h2 id="review-qr-heading" className="font-display text-xl font-medium text-ink">
        Scan to Share Your Experience
      </h2>
      {qrDataUrl ? (
        <div className="rounded-[10px] border border-border-soft bg-paper p-3">
          <img
            src={qrDataUrl}
            alt="QR code linking to the official Google review page"
            width={220}
            height={220}
          />
        </div>
      ) : error ? (
        <p className="max-w-sm text-sm leading-6 text-muted" role="status">
          {error}
        </p>
      ) : (
        <p className="text-sm text-muted" role="status">Preparing the review QR code…</p>
      )}
      <p className="max-w-sm text-sm leading-6 text-muted">
        Scan with your phone to open the store’s Google review page.
      </p>
    </section>
  )
}
