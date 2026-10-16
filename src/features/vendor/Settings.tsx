import { useState, useRef, useMemo } from 'react'
import { useAdminStore } from '@/features/admin/useAdminStore'
import type { StoreConfig } from '@/types'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import { validateUrl } from './lib'
import { buildShopTheme, hslToString, parseColor, toHex, HOUSE_PRIMARY } from '@/lib/theme'

export default function Settings() {
  const { store, loading, error, reload } = useAdminStore()

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!store) return <p className="text-muted">Unable to load store settings.</p>

  return <SettingsForm key={store.id} store={store} reload={reload} />
}

function SettingsForm({ store, reload }: { store: StoreConfig; reload: () => void }) {
  const { dataProvider } = useAdminStore()
  const [name, setName] = useState(store.name)
  const [subtitle, setSubtitle] = useState(store.subtitle ?? '')
  const [logoUrl, setLogoUrl] = useState(store.logoUrl ?? '')
  const [googleReviewUrl, setGoogleReviewUrl] = useState(store.googleReviewUrl ?? '')
  const [campaignBadge, setCampaignBadge] = useState(store.campaignBadge ?? '')
  const [primaryColor, setPrimaryColor] = useState(toHexSafe(store.primaryColor))
  const [secondaryColor, setSecondaryColor] = useState(toHexSafe(store.secondaryColor))
  const [minSpinAmount, setMinSpinAmount] = useState(String(store.minSpinAmount))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Live preview of the effective theme customers will see (readability-clamped).
  const theme = useMemo(
    () => buildShopTheme(primaryColor, secondaryColor),
    [primaryColor, secondaryColor],
  )

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    setFormError(null)

    if (!name.trim()) {
      setFormError('Store name is required.')
      setSaving(false)
      return
    }
    const urlError = validateUrl(googleReviewUrl)
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
        primaryColor,
        secondaryColor,
        googleReviewUrl: googleReviewUrl.trim() || null,
        campaignBadge: campaignBadge.trim(),
        minSpinAmount: Math.round(amount),
      })
      setMessage('Settings saved.')
      reload()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save settings.')
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
      setMessage(error instanceof Error ? error.message : 'Logo upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h1 className="font-display text-2xl font-bold text-ink">Store Branding</h1>
          <p className="text-sm text-muted">
            These settings drive your public Spin &amp; Win campaign.
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {/* Logo upload */}
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Store logo</p>
            <div className="flex items-center gap-4">
              <img
                src={logoUrl || '/logo-placeholder.svg'}
                alt="Store logo preview"
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

          {/* Brand colors */}
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Brand colors</p>
            <p className="mb-3 text-xs text-muted">
              Used across your public campaign — buttons, progress, badges, forms and the spin
              wheel.
            </p>
            <div className="flex flex-wrap items-start gap-4">
              <ColorSwatch label="Primary" value={primaryColor} onChange={setPrimaryColor} />
              <ColorSwatch label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Preview</span>
                <div className="flex items-center gap-2 rounded-xl border border-border-soft p-2">
                  <span
                    className="rounded-lg px-3 py-2 text-sm font-semibold"
                    style={{ background: hslToString(theme.primary), color: theme.onPrimary }}
                  >
                    Spin & Win
                  </span>
                  <span
                    className="rounded-lg px-3 py-2 text-sm font-semibold"
                    style={{ background: hslToString(theme.secondary), color: theme.onSecondary }}
                  >
                    Badge
                  </span>
                </div>
                {theme.adjusted && (
                  <p className="max-w-[22rem] text-xs text-amber-700" role="status">
                    Your primary color is deepened slightly on the public page so text stays
                    readable on it. The preview shows exactly what customers see.
                  </p>
                )}
              </div>
            </div>
          </div>

          <FormField label="Google Review URL" hint="Your store's Google review link. Customers may skip this.">
            <input
              className="field-input py-2"
              type="url"
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
              placeholder="https://search.google.com/local/writereview?placeid=…"
            />
          </FormField>

          <FormField label="Store slug" hint="Public route identifier — kept stable for your QR code.">
            <input className="field-input bg-border-soft py-2 text-muted" value={store.slug} readOnly />
          </FormField>

          {formError && <p className="text-xs text-red-600" role="alert">{formError}</p>}
          {message && (
            <p className={`text-xs ${message.includes('saved') || message.includes('uploaded') ? 'text-green-700' : 'text-red-600'}`} role="status">
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

      {/* Advanced settings */}
      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            <h2 className="font-display text-base font-semibold text-ink">More campaign settings</h2>
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
          </CardBody>
        )}
      </Card>
    </div>
  )
}

function toHexSafe(color: string | null | undefined): string {
  const rgb = parseColor(color) ?? parseColor(HOUSE_PRIMARY)!
  return toHex(rgb)
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="color"
        aria-label={`${label} color`}
        className="h-11 w-24 cursor-pointer rounded-lg border border-border-soft bg-white p-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-xs uppercase text-muted">{value}</span>
    </label>
  )
}
