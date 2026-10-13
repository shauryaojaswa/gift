import { useEffect, useState, useRef } from 'react'
import { useAdminStore } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'

export function StoreSettingsPage() {
  const { store, loading, dataProvider } = useAdminStore()
  const [name, setName] = useState(store?.name ?? '')
  const [subtitle, setSubtitle] = useState(store?.subtitle ?? '')
  const [logoUrl, setLogoUrl] = useState(store?.logoUrl ?? '')
  const [googleReviewUrlDraft, setGoogleReviewUrlDraft] = useState<string | null>(null)
  const [campaignBadge, setCampaignBadge] = useState(store?.campaignBadge ?? '')
  const [minSpinAmount, setMinSpinAmount] = useState(store?.minSpinAmount ?? 10000)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const googleReviewUrl = googleReviewUrlDraft ?? store?.googleReviewUrl ?? ''

  useEffect(() => {
    if (!store) return
    setName(store.name)
    setSubtitle(store.subtitle)
    setLogoUrl(store.logoUrl)
    setGoogleReviewUrlDraft(store.googleReviewUrl)
    setCampaignBadge(store.campaignBadge ?? '')
    setMinSpinAmount(store.minSpinAmount)
  }, [store])

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
        googleReviewUrl: googleReviewUrl.trim() || null,
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

  const handleLogoUpload = async (file: File) => {
    setUploading(true)
    setMessage(null)
    try {
      const url = await dataProvider.uploadStoreLogo(file)
      setLogoUrl(url)
      setMessage('Logo uploaded.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Logo upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-lg font-bold text-ink">Account &amp; Branding</h2>

      <Card>
        <CardHeader>
          <h3 className="font-display text-sm font-bold text-ink">Store branding</h3>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {/* Logo upload */}
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Store logo</p>
            <div className="flex items-center gap-4">
              <img
                src={logoUrl || '/logo-placeholder.svg'}
                alt="Current store logo"
                className="h-20 w-20 rounded-xl border border-border-soft bg-white object-contain p-2"
              />
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleLogoUpload(file)
                  }}
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className="btn-secondary inline-flex cursor-pointer items-center justify-center px-4 py-2 text-sm"
                >
                  {uploading ? 'Uploading…' : 'Upload logo'}
                </label>
                <p className="text-xs text-muted">JPG, PNG or WebP; maximum 5 MB.</p>
              </div>
            </div>
          </div>

          <FormField label="Store display name">
            <input className="field-input py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your store name" />
          </FormField>

          <FormField label="Campaign subtitle">
            <input className="field-input py-2" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. CUSTOMER REWARDS" />
          </FormField>

          <FormField label="Google Review URL">
            <input
              className="field-input py-2"
              type="url"
              placeholder="https://search.google.com/local/writereview?placeid=..."
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrlDraft(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Customers may skip this link. Reviews are optional and never affect reward eligibility.
            </p>
          </FormField>
        </CardBody>
        <CardFooter>
          <div className="flex w-full flex-col gap-2">
            {message && (
              <p className={`text-sm ${message.includes('saved') || message.includes('uploaded') ? 'text-green-700' : 'text-red-600'}`}>
                {message}
              </p>
            )}
            <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </CardFooter>
      </Card>

      {/* Advanced settings */}
      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            <h3 className="font-display text-sm font-bold text-ink">More campaign settings</h3>
            <svg
              className={`h-4 w-4 text-muted transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </CardHeader>
        {showAdvanced && (
          <CardBody className="flex flex-col gap-3">
            <FormField label="Campaign badge" hint="Shown on the customer-facing campaign page">
              <input className="field-input py-2" placeholder="SPIN & WIN" value={campaignBadge} onChange={(e) => setCampaignBadge(e.target.value)} />
            </FormField>
            <FormField label="Minimum qualifying purchase (₹)">
              <input className="field-input py-2" type="number" min={1} value={minSpinAmount} onChange={(e) => setMinSpinAmount(Number(e.target.value))} />
            </FormField>
          </CardBody>
        )}
      </Card>
    </div>
  )
}
