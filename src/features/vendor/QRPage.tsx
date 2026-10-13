import { useEffect, useState } from 'react'
import { Download, QrCode as QrIcon } from 'lucide-react'
import QRCode from 'qrcode'
import { useAdminStore } from '@/features/admin/useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { getCampaignUrl, downloadText } from './lib'

export default function QRPage() {
  const { store, loading: storeLoading } = useAdminStore()
  const slug = store?.slug ?? 'jolly-enterprises'
  const campaignUrl = getCampaignUrl(slug)
  const [png, setPng] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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

  const downloadSvg = () => {
    QRCode.toString(campaignUrl, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#49252d', light: '#fffdf9' },
    })
      .then((svg) => downloadText(`${slug}-campaign-qr.svg`, svg, 'image/svg+xml;charset=utf-8;'))
      .catch(() => setError('The SVG QR code could not be generated. Please try again.'))
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">My QR Code</h1>
        <p className="mt-1 text-sm text-muted">
          Print or share this code. It opens your public Spin &amp; Win campaign.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col items-center gap-4 rounded-xl border border-border-soft bg-paper px-6 py-8">
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

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={downloadPng}
            disabled={!png}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            Download PNG
          </button>
          <button
            type="button"
            onClick={downloadSvg}
            className="flex items-center gap-2 rounded-lg border border-border-soft bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand/40"
          >
            <Download size={16} aria-hidden="true" />
            Download SVG
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        Tip: print this code at your counter and on your standee so customers can scan it to start
        the Spin &amp; Win journey.
      </p>
    </div>
  )
}
