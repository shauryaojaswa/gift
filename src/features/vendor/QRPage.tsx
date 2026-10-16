import { useEffect, useState } from 'react'
import { Download, QrCode as QrIcon, Copy, Check } from 'lucide-react'
import QRCode from 'qrcode'
import { useAdminStore } from '@/features/admin/useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { getCampaignUrl } from './lib'

export default function QRPage() {
  const { store, loading: storeLoading } = useAdminStore()
  const slug = store?.slug
  const campaignUrl = slug ? getCampaignUrl(slug) : ''
  const [png, setPng] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!campaignUrl) return
    let cancelled = false
    QRCode.toDataURL(campaignUrl, {
      width: 640,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#49252d', light: '#fffdf9' },
    })
      .then((url) => {
        if (!cancelled) {
          setPng(url)
          setError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError('The QR code could not be generated. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [campaignUrl])

  const downloadPng = () => {
    if (!png) return
    const a = document.createElement('a')
    a.href = png
    a.download = `${slug}-campaign-qr.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(campaignUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard not available
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">QR Code &amp; Branding</h1>
        <p className="mt-1 text-sm text-muted">
          Print or share this code. It opens your public Spin &amp; Win campaign.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* QR Code */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border-soft bg-paper px-6 py-8 shadow-sm">
          {png ? (
            <div className="rounded-[10px] border border-border-soft bg-paper p-3">
              <img src={png} alt="QR code linking to your public campaign" width={256} height={256} />
            </div>
          ) : (
            <Spinner />
          )}

          <div className="text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-ink">
              <QrIcon size={16} className="text-brand" aria-hidden="true" />
              {storeLoading ? 'Loading store…' : (store?.name ?? 'Your store')}
            </p>
            <p className="mt-1 break-all text-xs text-muted" data-testid="campaign-url">
              {campaignUrl}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={downloadPng}
              disabled={!png}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Download size={16} aria-hidden="true" />
              Download QR code
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="btn-ghost flex items-center justify-center gap-2 text-sm"
            >
              {copied ? <Check size={16} className="text-green-600" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? 'Copied!' : 'Copy campaign link'}
            </button>
          </div>
        </div>

        {/* Campaign preview */}
        <div className="flex flex-col gap-4 rounded-xl border border-border-soft bg-paper p-6 shadow-sm">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Campaign Preview</h2>
            <p className="mt-1 text-sm text-muted">What customers see when they scan your QR code.</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border-soft bg-cream p-6">
            <img
              src={store?.logoUrl || '/assets/brand-logo.png'}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
            <div className="text-center">
              <p className="font-display text-lg font-bold text-ink">{store?.name ?? 'Your Store'}</p>
              {store?.subtitle && (
                <p className="text-xs uppercase tracking-wider text-muted">{store.subtitle}</p>
              )}
              {store?.campaignBadge && (
                <span className="mt-2 inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                  {store.campaignBadge}
                </span>
              )}
            </div>
            <p className="text-center text-xs text-muted">
              Scan to spin the wheel and win a reward
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        Tip: print this code at your counter and on your standee so customers can scan it to start
        the Spin &amp; Win journey.
      </p>
    </div>
  )
}
