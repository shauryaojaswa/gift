import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './AdminContext'
import { SubmissionsPage } from './SubmissionsPage'
import { StoreSettingsPage } from './StoreSettingsPage'
import { RewardsPage } from './RewardsPage'
import { TiersPage } from './TiersPage'

type Section = 'submissions' | 'store' | 'rewards' | 'tiers'

function AdminShellInner() {
  const { session, loading, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState<Section>('submissions')

  useEffect(() => {
    if (!loading && !session) {
      navigate('/admin/login', { replace: true, state: { from: '/admin' } })
    }
  }, [session, loading, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-brand" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  if (!session) return null

  const render: Record<Section, ReactNode> = {
    submissions: <SubmissionsPage />,
    store: <StoreSettingsPage />,
    rewards: <RewardsPage />,
    tiers: <TiersPage />,
  }

  return (
    <div className="min-h-screen bg-cream py-6">
      <div className="mx-auto max-w-5xl px-4">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-placeholder.svg" alt="" className="h-10 w-10" />
            <h1 className="font-display text-xl font-bold text-ink">JOLLY ENTERPRISES — Admin</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <NavBtn active={section === 'submissions'} onClick={() => setSection('submissions')}>
              Submissions
            </NavBtn>
            <NavBtn active={section === 'store'} onClick={() => setSection('store')}>
              Store
            </NavBtn>
            <NavBtn active={section === 'rewards'} onClick={() => setSection('rewards')}>
              Rewards
            </NavBtn>
            <NavBtn active={section === 'tiers'} onClick={() => setSection('tiers')}>
              Tiers
            </NavBtn>
            <button
              type="button"
              onClick={async () => {
                await logout()
                navigate('/admin/login', { replace: true })
              }}
              className="font-body text-xs text-muted hover:text-ink"
            >
              Sign out
            </button>
          </nav>
        </header>
        {render[section]}
      </div>
    </div>
  )
}

function NavBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-paper'
          : 'rounded-full bg-border-soft px-4 py-1.5 text-sm font-medium text-ink hover:bg-brand/10'
      }
    >
      {children}
    </button>
  )
}

export default function AdminShell() {
  return (
    <AdminAuthProvider>
      <AdminShellInner />
    </AdminAuthProvider>
  )
}
