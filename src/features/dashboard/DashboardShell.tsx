import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { DashboardProvider, useDashboard } from './DashboardContext'
import { Button, Loading, StatusPill } from '@/components/saas/ui'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/customers', label: 'Customers' },
  { to: '/dashboard/gifts', label: 'Gifts & Rewards' },
  { to: '/dashboard/qr', label: 'My QR Code' },
  { to: '/dashboard/settings', label: 'Store Settings' },
  { to: '/dashboard/subscription', label: 'Subscription & Billing' },
]

function ShellInner() {
  const { user, memberships, isPlatformAdmin, logout } = useAuth()
  const { store, subscription, loading, error } = useDashboard()

  if (loading) return <Loading label="Loading your dashboard…" />

  if (error || !store) {
    return (
      <div className="saas-root min-h-dvh w-full bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-slate-900">We could not load your store</p>
          <p className="mt-1 text-sm text-slate-500">{error ?? 'You do not have a store yet.'}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/onboarding"><Button size="sm">Set up a store</Button></Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="saas-root flex min-h-dvh w-full bg-slate-50">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">S</div>
          <span className="text-sm font-semibold text-slate-900">Spin &amp; Win</span>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {item.label}
            </NavLink>
          ))}
          {isPlatformAdmin && (
            <NavLink to="/platform-admin" className="mt-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
              Platform admin
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">{store.name || 'Your store'}</span>
            <StatusPill status={subscription?.status ?? 'active'} label={subscription?.planName ?? 'No plan'} />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:block">{user?.email}</span>
            {memberships.length > 1 && <span className="text-xs text-slate-400">{memberships.length} stores</span>}
            <Button variant="ghost" size="sm" onClick={() => { void logout() }}>Sign out</Button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium',
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 px-5 py-6">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DashboardShell() {
  const { memberships, loading } = useAuth()
  if (loading) return <Loading label="Checking your session…" />
  const storeId = memberships[0]?.store_id ?? null
  return (
    <DashboardProvider storeId={storeId}>
      <ShellInner />
    </DashboardProvider>
  )
}
