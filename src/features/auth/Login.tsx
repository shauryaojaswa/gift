import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Button, Field, Panel, TextInput } from '@/components/saas/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email, password)
      const from = (location.state as { from?: string })?.from
      navigate(from ?? '/dashboard', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="saas-root flex min-h-dvh w-full items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">S</div>
          <span className="text-sm font-semibold text-slate-900">Spin &amp; Win Rewards</span>
        </Link>
        <Panel className="p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Log in to your dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your store, gifts and customers.</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field label="Email" htmlFor="email">
              <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" />
            </Field>
            <Field label="Password" htmlFor="password">
              <TextInput id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Log in'}</Button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">
            New here? <Link to="/register" className="font-medium text-slate-900 hover:underline">Start a free trial</Link>
          </p>
        </Panel>
      </div>
    </div>
  )
}
