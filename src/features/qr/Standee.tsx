import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { useDataProvider } from '@/providers/DataProviderContext'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { GoogleReviewQrCode } from '@/components/ui/GoogleReviewQrCode'

export default function Standee() {
  const { slug = 'jolly-enterprises' } = useParams<{ slug: string }>()
  const dataProvider = useDataProvider()
  const [storeName, setStoreName] = useState('JOLLY ENTERPRISES')
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dataProvider
      .getStoreConfig(slug)
      .then((s) => {
        if (s) setStoreName(s.name)
      })
      .catch(() => {})
  }, [dataProvider, slug])

  useEffect(() => {
    const targetUrl = `${window.location.origin}/store/${slug}`
    QRCode.toString(targetUrl, {
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
  }, [slug])

  const copy = `${window.location.origin}/store/${slug}`

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
          <p className="font-display text-2xl font-bold text-ink">{storeName}</p>
          <p className="font-body text-sm text-muted">CUSTOMER EXPERIENCE</p>
        </div>
        <div className="rounded-full bg-brand/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand">
          Scan &middot; 60 Seconds &middot; Spin &amp; Win
        </div>
        <p className="font-body text-xs text-muted break-all">{copy}</p>
        <GoogleReviewQrCode />
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          Print Standee
        </button>
      </CardBody>
    </Card>
  )
}
