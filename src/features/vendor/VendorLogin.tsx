import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAdminAuth, AdminAuthProvider } from '@/features/admin/AdminContext'
import { useDataProvider } from '@/providers/DataProviderContext'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'
import { Store } from 'lucide-react'
import { resolveAssetUrl } from '@/components/ui/StoreLogo'
import { isRenderableLogo } from '@/lib/logo-upload'
import { isRoutableSlug, normalizeSlug } from '@/lib/slugs'
import type { StoreConfig } from '@/types'

/**
 * Which shop the sign-in screen belongs to.
 *
 * The owner opens a store's admin address (e.g. /pashupati2/admin) and is
 * redirected here. The address identifies the shop, so the screen can show
 * THAT shop's name, logo and branch label instead of one generic card that
 * looks identical for every shop. A system path (/vendor/login typed
 * directly) has no shop and keeps the generic screen.
 */
function storeSlugFromPath(path: string | undefined): string | null {
  const first = (path ?? '').split('/').filter(Boolean)[0]
  if (!first) return null
  const slug = normalizeSlug(first)
  return isRoutableSlug(slug) ? slug : null
}

/**
 * Vendor / shop-owner sign-in. Reuses the shared Supabase-backed admin auth
 * (see AdminContext). A vendor account is provisioned out-of-band (an invited
 * Supabase Auth user mapped to a store via the store_admins table) — see
 * VENDOR_SETUP.md. Demo mode has no secure credentials, so sign-in is refused.
 */
function VendorLoginInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, session } = useAdminAuth()
  const dataProvider = useDataProvider()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [store, setStore] = useState<StoreConfig | null>(null)
  const [logoBroken, setLogoBroken] = useState(false)

  const from = (location.state as { from?: string })?.from || '/vendor/dashboard'
  const slug = useMemo(() => storeSlugFromPath(from), [from])

  // Public read of the shop's own identity (name, logo, branch label) - the
  // same store record the customer page reads before anyone signs in. It
  // reveals nothing privileged and it never touches another shop's data.
  useEffect(() => {
    if (!slug) {
      setStore(null)
      return
    }
    let cancelled = false
    setStore(null)
    setLogoBroken(false)
    dataProvider
      .getStoreConfig(slug)
      .then((s) => {
        if (!cancelled) setStore(s)
      })
      .catch(() => {
        if (!cancelled) setStore(null)
      })
    return () => {
      cancelled = true
    }
  }, [dataProvider, slug])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await login(email, password)
    if (res.ok) {
      navigate(from, { replace: true })
    } else {
      setError(res.error ?? 'Login failed')
    }
    setSubmitting(false)
  }

  const logoUrl = (store?.logoUrl ?? '').trim()
  const showLogo = !!store && isRenderableLogo(logoUrl) && !logoBroken
  const branchLabel = store ? (store.locationLabel ?? null) : null

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-2 text-center">
            {showLogo ? (
              <img
                src={resolveAssetUrl(logoUrl)}
                alt=""
                className="h-12 w-12 rounded-lg border border-border-soft bg-white object-contain p-1"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Store size={24} aria-hidden="true" />
              </span>
            )}
            <h1 className="font-display text-2xl font-bold text-ink">
              {store ? store.name : 'Shop Owner Dashboard'}
            </h1>
            {store ? (
              <p className="text-sm text-muted">
                {branchLabel ? (
                  <span className="font-semibold uppercase tracking-wide text-ink">{branchLabel}</span>
                ) : null}
                {branchLabel ? ' · ' : null}Shop Owner Dashboard
              </p>
            ) : null}
            <p className="text-sm text-muted">Sign in to manage your campaign</p>
          </div>
        </CardHeader>
        <CardBody>
          {session ? (
            <p className="text-center text-sm text-muted">
              You are already signed in.{' '}
              <Link to="/vendor/dashboard" className="text-brand underline">
                Go to dashboard
              </Link>
            </p>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <FormField label="Email or login ID">
                <input
                  type="text"
                  className="field-input py-3 text-base"
                  placeholder="you@store.com or your shop name"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </FormField>
              <FormField label="Password">
                <input
                  type="password"
                  className="field-input py-3 text-base"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required={!import.meta.env.DEV}
                />
              </FormField>
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}
        </CardBody>
        <CardFooter>
          {import.meta.env.DEV && (
            <p className="mb-2 rounded-md bg-brand/5 px-3 py-2 text-center text-xs text-ink">
              <strong className="font-semibold">Local preview:</strong> enter any email (password optional)
              to explore the dashboard on this device. This is not available in production.
            </p>
          )}
          <p className="text-center text-xs text-muted">
            Production sign-in requires a configured Supabase project with an invited account mapped to your
            store. See VENDOR_SETUP.md.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function VendorLogin() {
  return (
    <AdminAuthProvider>
      <VendorLoginInner />
    </AdminAuthProvider>
  )
}
