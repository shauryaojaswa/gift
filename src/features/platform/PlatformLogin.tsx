import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAdminAuth, AdminAuthProvider } from '@/features/admin/AdminContext'
import { getSupabaseClient } from '@/lib/data'
import { isPlatformAdmin } from './api'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'
import { ShieldCheck } from 'lucide-react'

/**
 * JRIQ platform-admin sign-in. Same Supabase Auth as the vendor dashboard, but
 * access additionally requires a `platform_admins` membership which is checked
 * here for UX and enforced again inside every management RPC server-side.
 */
function PlatformLoginInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, session, logout } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string })?.from || '/platform/shops'
  const client = getSupabaseClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) {
      setError('Platform administration requires a configured Supabase project.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await login(email, password)
    if (!res.ok) {
      setError(res.error ?? 'Login failed')
      setSubmitting(false)
      return
    }
    const current = await client.auth.getUser()
    const userId = current.data.user?.id
    const allowed = userId ? await isPlatformAdmin(client, userId) : false
    if (allowed) {
      navigate(from, { replace: true })
    } else {
      await logout()
      setError('This account does not have platform administration access.')
    }
    setSubmitting(false)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-bold text-ink">JRIQ Platform Admin</h1>
            <p className="text-sm text-muted">Sign in to manage shops and the gift catalogue</p>
          </div>
        </CardHeader>
        <CardBody>
          {session ? (
            <p className="text-center text-sm text-muted">
              You are already signed in.{' '}
              <Link to="/platform/shops" className="text-brand underline">
                Go to platform admin
              </Link>
            </p>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <FormField label="Email">
                <input
                  type="email"
                  className="field-input py-3 text-base"
                  placeholder="admin@jriq.in"
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
                  required
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
          <p className="text-center text-xs text-muted">
            Platform access is granted by an existing administrator and verified on every server
            operation. Shop owners use the{' '}
            <Link to="/vendor/login" className="text-brand underline">
              vendor dashboard
            </Link>{' '}
            instead.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function PlatformLogin() {
  return (
    <AdminAuthProvider>
      <PlatformLoginInner />
    </AdminAuthProvider>
  )
}
