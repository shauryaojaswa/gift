import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { useDataProvider } from '@/providers/DataProviderContext'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { GoogleReviewQrCode } from '@/components/ui/GoogleReviewQrCode'
import type { StoreConfig } from '@/types'

export default function Standee() {
  // Strict: the URL is the only slug source. Never fall back to another shop.
  const { slug = '' } = useParams<{ slug: string }>()
  const dataProvider = useDataProvider()
  const [store, setStore] = useState<StoreConfig | null>(null)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dataProvider
      .getStoreConfig(slug)
      .then((result) => {
        setStore(result)
        if (!result) setStoreError('Store configuration was not found.')
      })
      .catch((error: unknown) => {
        setStoreError(error instanceof Error ? error.message : 'Store configuration could not be loaded.')
      })
  }, [dataProvider, slug])

  // Build the public campaign URL from the deployment base so the QR code and
  // the printed link stay correct under a subpath such as GitHub Pages "/gift/".
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  const campaignUrl = `${window.location.origin}${basePath}/${slug}`

  useEffect(() => {
    QRCode.toString(campaignUrl, {
      type: 'svg',
      width: 256,
      margin: 2,
      color: { dark: '#B71C1C', light: '#ffffff' },
    })
      .then((svg) => {
        setQrSvg(svg)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [campaignUrl, slug])

  const copy = campaignUrl

  return (
    <Card className="mt-6 print:shadow-none print:border-none" id="standee-print">
      <CardHeader>
        <h1 className="font-display text-sm uppercase tracking-[0.25em] text-muted">Scan &amp; Spin</h1>
      </CardHeader>
      <CardBody className="flex flex-col items-center gap-4">
        {loading ? (
          <Spinner />
        ) : (
          qrSvg && (
            <div
              className="bg-paper p-4 rounded-2xl"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="QR code"
            />
          )
        )}
        <div className="text-center">
          <p className="font-display text-2xl font-bold text-ink">{store?.name ?? 'CUSTOMER REWARDS'}</p>
          <p className="font-body text-sm text-muted">CUSTOMER EXPERIENCE</p>
        </div>
        {storeError && <p role="alert" className="text-center text-sm text-red-700">{storeError}</p>}
        <div className="rounded-full bg-brand/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand">
          Scan &middot; 60 Seconds &middot; Spin &amp; Win
        </div>
        <p className="font-body text-xs text-muted break-all">{copy}</p>
        <GoogleReviewQrCode reviewUrl={store?.googleReviewUrl ?? null} />
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          Print Standee
        </button>
      </CardBody>
    </Card>
  )
}
