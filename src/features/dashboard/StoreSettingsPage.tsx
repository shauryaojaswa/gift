import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useDashboard } from './DashboardContext'
import { Button, ErrorNotice, Field, PageHeader, Panel, SuccessNotice, TextInput } from '@/components/saas/ui'

export default function StoreSettingsPage() {
  const { store, reload } = useDashboard()
  const [form, setForm] = useState({
    name: '', subtitle: '', logoUrl: '', primaryColor: '', secondaryColor: '',
    googleReviewUrl: '', campaignBadge: '', minSpinAmount: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!store) return
    setForm({
      name: store.name,
      subtitle: store.subtitle,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      googleReviewUrl: store.googleReviewUrl ?? '',
      campaignBadge: store.campaignBadge ?? '',
      minSpinAmount: String(store.minSpinAmount),
    })
  }, [store])

  if (!store) return null

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await api.updateStore(store.id, {
        name: form.name,
        subtitle: form.subtitle,
        logoUrl: form.logoUrl,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        googleReviewUrl: form.googleReviewUrl || null,
        campaignBadge: form.campaignBadge || null,
        minSpinAmount: Number(form.minSpinAmount) || 0,
      })
      await reload()
      setSuccess('Store settings saved.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Store Settings" description="Your store name, logo, colours and campaign copy." />

      {success && <div className="mb-4"><SuccessNotice message={success} /></div>}
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <Panel className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Store details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Store display name" hint="Shown to you and used across your dashboard.">
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your store name" />
            </Field>
            <Field label="Campaign URL slug" hint={`/store/${store.slug} — contact support to change this.`}>
              <TextInput value={store.slug} disabled />
            </Field>
            <Field label="Subtitle" hint="Small line above the campaign badge.">
              <TextInput value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </Field>
            <Field label="Campaign badge">
              <TextInput value={form.campaignBadge} onChange={(e) => setForm({ ...form, campaignBadge: e.target.value })} placeholder="SPIN & WIN" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Logo URL">
                <TextInput value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
              </Field>
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {form.logoUrl && <img src={form.logoUrl} alt="Logo preview" className="h-14 w-14 object-contain" />}
                <span className="text-xs text-slate-500">Logo preview</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Brand &amp; reviews</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Primary colour"><TextInput value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} /></Field>
            <Field label="Secondary colour"><TextInput value={form.secondaryColor} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              <Field label="Google Review URL (optional)" hint="Must be an https link to your Google review or Business Profile page.">
                <TextInput value={form.googleReviewUrl} onChange={(e) => setForm({ ...form, googleReviewUrl: e.target.value })} placeholder="https://search.google.com/local/writereview?placeid=…" />
              </Field>
            </div>
            <Field label="Minimum qualifying purchase (₹)" hint="Purchases below this amount do not qualify.">
              <TextInput inputMode="numeric" value={form.minSpinAmount} onChange={(e) => setForm({ ...form, minSpinAmount: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
        </Panel>

        <div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </div>
      </form>
    </div>
  )
}
