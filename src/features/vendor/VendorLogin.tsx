import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAdminAuth, AdminAuthProvider } from '@/features/admin/AdminContext'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'
import { Store } from 'lucide-react'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string })?.from || '/vendor/dashboard'

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

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Store size={24} aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-bold text-ink">Shop Owner Dashboard</h1>
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
              <FormField label="Email">
                <input
                  type="email"
                  className="field-input py-3 text-base"
                  placeholder="you@store.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
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
