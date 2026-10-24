import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAdminAuth, AdminAuthProvider } from './AdminContext'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'

function AdminLoginInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string })?.from || '/dashboard'

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
    <div className="w-full max-w-md mx-auto mt-8">
      <Card>
        <CardHeader>
          <h1 className="font-display text-2xl font-bold text-center text-ink">Store Dashboard</h1>
          <p className="text-center text-sm text-muted">Sign in to manage your store’s campaign</p>
        </CardHeader>
        <CardBody>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Email or login ID" error={null}>
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
            <FormField label="Password" error={null}>
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
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </CardBody>
        <CardFooter>
          <p className="text-center text-xs text-muted">
            Use the secure invitation sent by your platform team to access this workspace.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function AdminLogin() {
  return (
    <AdminAuthProvider>
      <AdminLoginInner />
    </AdminAuthProvider>
  )
}
