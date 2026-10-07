import { useState } from 'react'
import { useAdminStore, ADMIN_STORE_SLUG } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'

export function StoreSettingsPage() {
  const { store, loading, dataProvider } = useAdminStore()
  const [name, setName] = useState(store?.name ?? '')
  const [subtitle, setSubtitle] = useState(store?.subtitle ?? '')
  const [logoUrl, setLogoUrl] = useState(store?.logoUrl ?? '')
  const [primaryColor, setPrimaryColor] = useState(store?.primaryColor ?? '')
  const [secondaryColor, setSecondaryColor] = useState(store?.secondaryColor ?? '')
  const [googleReviewUrl, setGoogleReviewUrl] = useState(store?.googleReviewUrl ?? '')
  const [campaignBadge, setCampaignBadge] = useState(store?.campaignBadge ?? '')
  const [minSpinAmount, setMinSpinAmount] = useState(store?.minSpinAmount ?? 10000)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load store config.</p>

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await dataProvider.updateStore({
        name,
        subtitle,
        logoUrl,
        primaryColor,
        secondaryColor,
        googleReviewUrl,
        campaignBadge,
        minSpinAmount,
      })
      setMessage('Store settings saved.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-lg font-bold text-ink">Store Settings</h2>
        <p className="text-sm text-muted">Store slug: {ADMIN_STORE_SLUG}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <FormField label="Store name">
          <input className="field-input py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Subtitle">
          <input className="field-input py-2" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </FormField>
        <FormField label="Logo URL">
          <input className="field-input py-2" placeholder="/logo-placeholder.svg" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </FormField>
        <FormField label="Primary colour (brand)">
          <input className="field-input py-2" placeholder="hsl(355 85% 45%)" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </FormField>
        <FormField label="Secondary colour">
          <input className="field-input py-2" placeholder="hsl(200 90% 55%)" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
        </FormField>
        <FormField label="Google Review URL">
          <input className="field-input py-2" placeholder="https://..." value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} />
        </FormField>
        <FormField label="Campaign badge">
          <input className="field-input py-2" placeholder="LUCKY REWARD" value={campaignBadge} onChange={(e) => setCampaignBadge(e.target.value)} />
        </FormField>
        <FormField label="Minimum qualifying purchase (₹)">
          <input className="field-input py-2" type="number" min={1} value={minSpinAmount} onChange={(e) => setMinSpinAmount(Number(e.target.value))} />
        </FormField>
        {message && <p className={`text-xs ${message.startsWith('Store settings saved') ? 'text-green-700' : 'text-red-600'}`}>{message}</p>}
      </CardBody>
      <CardFooter>
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </CardFooter>
    </Card>
  )
}
