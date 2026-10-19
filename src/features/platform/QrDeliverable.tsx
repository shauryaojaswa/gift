import { useEffect, useState } from 'react'
import {
  downloadDataUrl,
  downloadSvgFile,
  generateQrPng,
  generateQrSvg,
  getCampaignUrl,
} from '@/lib/qr'
import { Spinner } from '@/components/ui/Spinner'

/** Customer URL + print-ready QR artefacts (PNG ≥1000px and SVG). */
export function QrDeliverable({ slug }: { slug: string }) {
  const url = getCampaignUrl(slug)
  const [png, setPng] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([generateQrPng(url), generateQrSvg(url)])
      .then(([pngUrl, svgText]) => {
        if (!cancelled) {
          setPng(pngUrl)
          setSvg(svgText)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPng(null)
          setSvg(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex flex-wrap items-center gap-4">
      {png ? (
        <img
          src={png}
          alt={`QR code for ${url}`}
          className="h-32 w-32 rounded-lg border border-border-soft"
        />
      ) : (
        <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-border-soft">
          <Spinner />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted">Customer page</p>
        <p className="break-all font-mono text-sm text-ink">{url}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!png}
            onClick={() => png && downloadDataUrl(`${slug}-campaign-qr.png`, png)}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Download QR code
          </button>
          <button
            type="button"
            disabled={!svg}
            onClick={() => svg && downloadSvgFile(`${slug}-campaign-qr.svg`, svg)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Download print SVG
          </button>
        </div>
      </div>
    </div>
  )
}
