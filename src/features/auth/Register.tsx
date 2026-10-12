import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Button, Field, Panel, TextInput } from '@/components/saas/ui'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await register(email, password, fullName)
      navigate('/onboarding', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your account')
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
          <h1 className="text-lg font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">14 days free. No card required.</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field label="Your name" htmlFor="fullName">
              <TextInput id="fullName" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Store owner name" />
            </Field>
            <Field label="Email" htmlFor="email">
              <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 8 characters.">
              <TextInput id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button>
          </form>
          <p className="mt-5 text-center text-xs text-slate-500">
            By continuing you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>
          <p className="mt-3 text-center text-sm text-slate-500">
            Already have an account? <Link to="/login" className="font-medium text-slate-900 hover:underline">Log in</Link>
          </p>
        </Panel>
      </div>
    </div>
  )
}
