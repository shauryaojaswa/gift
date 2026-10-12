import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useDashboard } from './DashboardContext'
import { Button, PageHeader, Panel, SuccessNotice } from '@/components/saas/ui'

export default function QrPage() {
  const { store } = useDashboard()
  const [svg, setSvg] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const publicUrl = store ? `${window.location.origin}/store/${store.slug}` : ''

  useEffect(() => {
    if (!publicUrl) return
    QRCode.toString(publicUrl, { type: 'svg', width: 280, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(null))
  }, [publicUrl])

  if (!store) return null

  const downloadPng = async () => {
    const dataUrl = await QRCode.toDataURL(publicUrl, { width: 1024, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${store.slug}-qr.png`
    link.click()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setNotice('Campaign link copied.')
    } catch {
      setNotice('Could not copy automatically — please copy the link below.')
    }
  }

  return (
    <div>
      <PageHeader
        title="My QR Code"
        description="Print this code for your billing counter. It always points to your live campaign."
      />

      {notice && <div className="mb-4"><SuccessNotice message={notice} /></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="flex flex-col items-center gap-4 p-6">
          {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} aria-label="Campaign QR code" /> : <p className="text-sm text-slate-500">Generating…</p>}
          <p className="break-all text-center text-xs text-slate-500">{publicUrl}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={downloadPng}>Download PNG</Button>
            <Button size="sm" variant="secondary" onClick={copyLink}>Copy link</Button>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Share your campaign</h2>
            <p className="mt-2 text-sm text-slate-500">
              Customers scan the QR code or open this link to start the Spin &amp; Win experience.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link to={`/store/${store.slug}`} target="_blank"><Button variant="secondary" className="w-full">Preview campaign</Button></Link>
              <Link to={`/standee/${store.slug}`} target="_blank"><Button variant="secondary" className="w-full">Open print standee</Button></Link>
            </div>
          </Panel>
          <Panel className="p-5 text-sm text-slate-500">
            <h2 className="text-sm font-semibold text-slate-900">Where does this code point?</h2>
            <p className="mt-2">
              The code encodes your public campaign address. Each store has its own code, so a customer scanning your
              code always enters your campaign and never another store's.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
