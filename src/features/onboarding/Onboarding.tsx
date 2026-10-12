import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/features/auth/AuthContext'
import type { OwnerStore } from '@/types/saas'
import { slugify } from '@/lib/slug'
import { Button, Field, Panel, TextInput, ErrorNotice } from '@/components/saas/ui'
import { RewardsSection, TiersSection } from '@/features/dashboard/StoreEditor'
import QRCode from 'qrcode'

const STEPS = ['Store details', 'Brand & reviews', 'Gifts & tiers', 'Publish']

export default function Onboarding() {
  const { refresh } = useAuth()
  const [step, setStep] = useState(0)
  const [store, setStore] = useState<OwnerStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('/assets/brand-logo.png')
  const [primaryColor, setPrimaryColor] = useState('hsl(350 48% 27%)')
  const [secondaryColor, setSecondaryColor] = useState('hsl(39 34% 59%)')
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [qrSvg, setQrSvg] = useState<string | null>(null)

  const publicUrl = store ? `${window.location.origin}/store/${store.slug}` : ''

  const createStore = async () => {
    setSaving(true)
    setError(null)
    try {
      const created = await api.createStore({ name, slug: slug || slugify(name), logoUrl })
      setStore(created)
      await refresh()
      setStep(1)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create your store')
    } finally {
      setSaving(false)
    }
  }

  const saveBrand = async () => {
    if (!store) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateStore(store.id, {
        primaryColor, secondaryColor, googleReviewUrl: googleReviewUrl || null,
      })
      setStore(updated)
      setStep(2)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your brand settings')
    } finally {
      setSaving(false)
    }
  }

  const reloadStore = async () => {
    if (!store) return
    const result = await api.getStore(store.id)
    setStore(result.store)
  }

  const goToPublish = async () => {
    if (!store) return
    setSaving(true)
    try {
      const svg = await QRCode.toString(`${window.location.origin}/store/${store.slug}`, {
        type: 'svg', width: 256, margin: 2, color: { dark: '#0f172a', light: '#ffffff' },
      })
      setQrSvg(svg)
      setStep(3)
    } catch {
      setError('Could not generate the QR code.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="saas-root min-h-dvh w-full bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">S</div>
          <span className="text-sm font-semibold text-slate-900">Set up your store</span>
        </div>

        <ol className="mb-6 flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, index) => (
            <li key={label} className={`rounded-full border px-3 py-1 ${index === step ? 'border-slate-900 bg-slate-900 text-white' : index < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

        {step === 0 && (
          <Panel className="p-6">
            <h1 className="text-lg font-semibold text-slate-900">Tell us about your store</h1>
            <p className="mt-1 text-sm text-slate-500">You can change all of this later in Store Settings.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Store display name" hint="Use the exact name customers know you by.">
                <TextInput value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)) }} placeholder="Your jewellery store name" />
              </Field>
              <Field label="Campaign URL slug" hint={`Customers will visit /store/${slug || 'your-store'}`}>
                <TextInput value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="your-store" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Logo URL" hint="Leave the supplied logo, or paste a link to your own.">
                  <TextInput value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
                </Field>
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <img src={logoUrl} alt="Logo preview" className="h-14 w-14 object-contain" />
                  <span className="text-xs text-slate-500">Logo preview</span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Button onClick={createStore} disabled={saving || name.trim().length < 2}>{saving ? 'Creating…' : 'Continue'}</Button>
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel className="p-6">
            <h1 className="text-lg font-semibold text-slate-900">Brand &amp; Google Review</h1>
            <p className="mt-1 text-sm text-slate-500">Set your campaign colours and an optional Google review link.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Primary colour">
                <TextInput value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
              </Field>
              <Field label="Secondary colour">
                <TextInput value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Google Review URL (optional)" hint="Must be an https link to your Google review or Business Profile page.">
                  <TextInput value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} placeholder="https://search.google.com/local/writereview?placeid=…" />
                </Field>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={saveBrand} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
            </div>
          </Panel>
        )}

        {step === 2 && store && (
          <div className="flex flex-col gap-6">
            <Panel className="p-6">
              <h1 className="text-lg font-semibold text-slate-900">Gifts &amp; purchase tiers</h1>
              <p className="mt-1 text-sm text-slate-500">
                We have set up sensible defaults for you. Edit anything that does not match your shop.
              </p>
            </Panel>
            <RewardsSection store={store} onSaved={reloadStore} embedded />
            <TiersSection store={store} onSaved={reloadStore} embedded />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={goToPublish} disabled={saving}>{saving ? 'Preparing…' : 'Continue'}</Button>
            </div>
          </div>
        )}

        {step === 3 && store && (
          <Panel className="p-6">
            <h1 className="text-lg font-semibold text-slate-900">Your campaign is ready</h1>
            <p className="mt-1 text-sm text-slate-500">Print the QR code for your counter, or share the link.</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {qrSvg && <div dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="Campaign QR code" />}
                <span className="break-all text-center text-xs text-slate-500">{publicUrl}</span>
              </div>
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-slate-200 p-4 text-sm">
                  <p className="font-medium text-slate-900">{store.name || 'Your store'}</p>
                  <p className="mt-1 text-slate-500">Campaign URL</p>
                  <p className="break-all text-slate-700">{publicUrl}</p>
                </div>
                <Link to={`/store/${store.slug}`} target="_blank"><Button variant="secondary" className="w-full">Preview campaign</Button></Link>
                <Link to="/dashboard"><Button className="w-full">Go to dashboard</Button></Link>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
