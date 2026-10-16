import QRCode from 'qrcode'
import { getCampaignUrl } from '@/features/vendor/lib'

/**
 * One printable-QR pipeline for every surface (vendor dashboard, legacy admin,
 * platform wizard, standee). The payload always comes from the canonical URL
 * builder (getCampaignUrl), so a printed symbol decodes to exactly
 * `https://jriq.in/{slug}` - never an admin path, a legacy /store/ path or a
 * preview host.
 */

/** Print-ready raster size (well above the 1000px printability floor). */
export const QR_PNG_WIDTH = 1200
/** Print-ready vector size; SVG stays resolution-independent at any print size. */
export const QR_SVG_WIDTH = 1024

/** House QR ink: dark ink on the warm paper tone for dependable scan contrast. */
const QR_INK = { dark: '#49252d', light: '#fffdf9' } as const

export { getCampaignUrl }

/** Printable PNG data URL (≥1000px) encoding the given URL. */
export function generateQrPng(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: QR_PNG_WIDTH,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: QR_INK,
  })
}

/** Printable SVG markup encoding the given URL. */
export function generateQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    width: QR_SVG_WIDTH,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: QR_INK,
  })
}

/** Trigger a browser download of a data-URL or blob-URL artefact. */
export function downloadDataUrl(filename: string, href: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Trigger a browser download of raw text (e.g. SVG markup). */
export function downloadSvgFile(filename: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(filename, url)
  URL.revokeObjectURL(url)
}
