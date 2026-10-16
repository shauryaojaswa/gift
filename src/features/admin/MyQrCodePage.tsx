import { useEffect, useState } from 'react'
import { useAdminStore } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import {
  generateQrPng,
  generateQrSvg,
  getCampaignUrl,
  downloadDataUrl,
  downloadSvgFile,
} from '@/lib/qr'

export function MyQrCodePage() {
  const { store, loading } = useAdminStore()
  const [qr, setQr] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Canonical customer address (https://jriq.in/{slug}) - never an admin path.
  const campaignUrl = store ? getCampaignUrl(store.slug) : ''

  useEffect(() => {
    if (!campaignUrl) return
    let cancelled = false
    Promise.all([generateQrPng(campaignUrl), generateQrSvg(campaignUrl)])
      .then(([pngUrl, svgText]) => {
        if (!cancelled) {
          setQr(pngUrl)
          setSvg(svgText)
          setError(null)
        }
      }).catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'QR code could not be created')
      })
    return () => {
      cancelled = true
    }
  }, [campaignUrl])

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load your campaign.</p>

  const download = () => {
    if (!qr) return
    downloadDataUrl(`${store.slug}-campaign-qr.png`, qr)
  }

  const downloadSvg = () => {
    if (!svg) return
    downloadSvgFile(`${store.slug}-campaign-qr.svg`, svg)
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
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-lg font-bold text-ink">QR Code &amp; Branding</h2>

      <div className="grid gap-6 md:grid-cols-2">
        {/* QR Code */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border-soft bg-paper p-6 text-center shadow-sm">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Campaign QR Code</h3>
            <p className="mt-1 text-sm text-muted">Scan this code to open your Spin &amp; Win campaign.</p>
          </div>
          {qr ? (
            <img src={qr} alt="QR code for your Spin & Win campaign" className="h-56 w-56 rounded-xl border border-border-soft p-2" />
          ) : error ? (
            <p role="alert" className="text-sm text-red-700">{error}</p>
          ) : (
            <Spinner />
          )}
          <div className="flex w-full flex-col gap-2">
            <button type="button" className="btn-primary" disabled={!qr} onClick={download}>
              Download QR code
            </button>
            <button type="button" className="btn-secondary text-sm" disabled={!svg} onClick={downloadSvg}>
              Download print SVG
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy campaign link'}
            </button>
          </div>
          <p className="break-all text-xs text-muted">{campaignUrl}</p>
        </div>

        {/* Campaign preview */}
        <div className="flex flex-col gap-4 rounded-xl border border-border-soft bg-paper p-6 shadow-sm">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Campaign Preview</h3>
            <p className="mt-1 text-sm text-muted">This is what customers see when they scan your QR code.</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border-soft bg-cream p-6">
            <img
              src={store.logoUrl || '/assets/brand-logo.png'}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
            <div className="text-center">
              <p className="font-display text-lg font-bold text-ink">{store.name}</p>
              {store.subtitle && (
                <p className="text-xs uppercase tracking-wider text-muted">{store.subtitle}</p>
              )}
              {store.campaignBadge && (
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
    </div>
  )
}
