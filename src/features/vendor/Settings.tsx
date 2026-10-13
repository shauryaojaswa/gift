import { useState } from 'react'
import { useAdminStore } from '@/features/admin/useAdminStore'
import type { StoreConfig } from '@/types'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import { validateUrl } from './lib'

/**
 * Vendor Store Settings. Edits the same store record the customer campaign
 * reads (name, subtitle, logo, Google Review URL, campaign badge, minimum
 * qualifying purchase). The slug is shown read-only so the public route stays
 * stable. URLs and amounts are validated before saving.
 */
export default function Settings() {
  const { store, loading, error, reload } = useAdminStore()

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!store) return <p className="text-muted">Unable to load store settings.</p>

  // Mount the form only once the store is loaded so field state seeds correctly.
  // Keyed by store id so a store switch re-seeds the form.
  return <SettingsForm key={store.id} store={store} reload={reload} />
}

function SettingsForm({ store, reload }: { store: StoreConfig; reload: () => void }) {
  const { dataProvider } = useAdminStore()
  const [name, setName] = useState(store.name)
  const [subtitle, setSubtitle] = useState(store.subtitle ?? '')
  const [logoUrl, setLogoUrl] = useState(store.logoUrl ?? '')
  const [googleReviewUrl, setGoogleReviewUrl] = useState(store.googleReviewUrl ?? '')
  const [campaignBadge, setCampaignBadge] = useState(store.campaignBadge ?? '')
  const [minSpinAmount, setMinSpinAmount] = useState(String(store.minSpinAmount))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    setFormError(null)

    if (!name.trim()) {
      setFormError('Store name is required.')
      setSaving(false)
      return
    }
    const urlError = validateUrl(logoUrl) ?? validateUrl(googleReviewUrl)
    if (urlError) {
      setFormError(urlError)
      setSaving(false)
      return
    }
    const amount = Number(minSpinAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Minimum qualifying purchase must be a number of ₹0 or more.')
      setSaving(false)
      return
    }

    try {
      await dataProvider.updateStore({
        name: name.trim(),
        subtitle: subtitle.trim(),
        logoUrl: logoUrl.trim(),
        googleReviewUrl: googleReviewUrl.trim() || null,
        campaignBadge: campaignBadge.trim(),
        minSpinAmount: Math.round(amount),
      })
      setMessage('Settings saved. New customer sessions will use the updated configuration.')
      reload()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="font-display text-2xl font-bold text-ink">Store Settings</h1>
        <p className="text-sm text-muted">
          These settings drive your public Spin &amp; Win campaign. Changes apply to new customer sessions.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <FormField label="Store slug" hint="Public route identifier — shown for reference, kept stable.">
          <input className="field-input bg-border-soft py-2 text-muted" value={store.slug} readOnly />
        </FormField>

        <FormField label="Store display name">
          <input
            className="field-input py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your store's customer-facing name"
          />
        </FormField>

        <FormField label="Subtitle">
          <input
            className="field-input py-2"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="e.g. CUSTOMER REWARDS"
          />
        </FormField>

        <FormField label="Logo URL">
          <input
            className="field-input py-2"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="/assets/brand-logo.png or https://…"
          />
        </FormField>

        <FormField
          label="Google Review URL"
          hint="Your store's Google review link. VITE_GOOGLE_REVIEW_URL overrides this when configured."
        >
          <input
            className="field-input py-2"
            type="url"
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
            placeholder="https://search.google.com/local/writereview?placeid=…"
          />
        </FormField>

        <FormField label="Campaign badge">
          <input
            className="field-input py-2"
            value={campaignBadge}
            onChange={(e) => setCampaignBadge(e.target.value)}
            placeholder="e.g. SPIN & WIN"
          />
        </FormField>

        <FormField label="Minimum qualifying purchase (₹)">
          <input
            className="field-input py-2"
            type="number"
            min={0}
            value={minSpinAmount}
            onChange={(e) => setMinSpinAmount(e.target.value)}
          />
        </FormField>

        {formError && <p className="text-xs text-red-600" role="alert">{formError}</p>}
        {message && (
          <p className={`text-xs ${message.startsWith('Settings saved') ? 'text-green-700' : 'text-red-600'}`} role="status">
            {message}
          </p>
        )}
      </CardBody>
      <CardFooter>
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </CardFooter>
    </Card>
  )
}

