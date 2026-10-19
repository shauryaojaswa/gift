import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './AdminContext'
import { SubmissionsPage } from './SubmissionsPage'
import { StoreSettingsPage } from './StoreSettingsPage'
import { RewardsPage } from './RewardsPage'
import { DashboardOverview } from './DashboardOverview'
import { MyQrCodePage } from './MyQrCodePage'
import { useAdminStore } from './useAdminStore'
import { StorageStatus } from '@/components/ui/StorageStatus'

type Section = 'overview' | 'customers' | 'campaign' | 'qr' | 'account'

const NAV_ITEMS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'customers', label: 'Customers' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'qr', label: 'QR Code & Branding' },
  { key: 'account', label: 'Account' },
]

function AdminShellInner() {
  const { session, loading, logout } = useAdminAuth()
  const navigate = useNavigate()
  const { store } = useAdminStore()
  const [section, setSection] = useState<Section>('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !session) {
      navigate('/dashboard/login', { replace: true, state: { from: '/dashboard' } })
    }
  }, [session, loading, navigate])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [section])

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
    overview: <DashboardOverview onNavigate={setSection} />,
    customers: <SubmissionsPage />,
    campaign: <RewardsPage />,
    qr: <MyQrCodePage />,
    account: <StoreSettingsPage />,
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border-soft bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={store?.logoUrl || '/assets/brand-logo.png'}
              alt=""
              className="h-9 w-9 rounded-full object-contain"
            />
            <h1 className="font-display text-lg font-bold text-ink">
              {store?.name || 'Store Dashboard'}
            </h1>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                aria-current={section === item.key ? 'page' : undefined}
                className={
                  section === item.key
                    ? 'rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-paper'
                    : 'rounded-lg px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand/8'
                }
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                await logout()
                navigate('/dashboard/login', { replace: true })
              }}
              className="ml-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted hover:bg-border-soft hover:text-ink"
            >
              Sign out
            </button>
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="tap-target flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-border-soft md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <>
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <nav className="border-t border-border-soft bg-paper px-4 py-3 md:hidden" aria-label="Mobile navigation">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSection(item.key)}
                  aria-current={section === item.key ? 'page' : undefined}
                  className={
                    section === item.key
                      ? 'rounded-lg bg-brand px-4 py-2.5 text-left text-sm font-medium text-paper'
                      : 'rounded-lg px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-brand/8'
                  }
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={async () => {
                  await logout()
                  navigate('/dashboard/login', { replace: true })
                }}
                className="rounded-lg px-4 py-2.5 text-left text-sm font-medium text-muted hover:bg-border-soft hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <StorageStatus />
        </div>
        {render[section]}
      </main>
    </div>
  )
}

export default function AdminShell() {
  return (
    <AdminAuthProvider>
      <AdminShellInner />
    </AdminAuthProvider>
  )
}
