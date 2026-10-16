import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Store, Gift, LogOut, ShieldCheck } from 'lucide-react'
import { AdminAuthProvider, useAdminAuth } from '@/features/admin/AdminContext'
import { getSupabaseClient } from '@/lib/data'
import { isPlatformAdmin } from './api'
import { Spinner } from '@/components/ui/Spinner'

const NAV = [
  { to: '/platform/shops', label: 'Shops', icon: Store },
  { to: '/platform/catalog', label: 'Gift Catalogue', icon: Gift },
]

/**
 * JRIQ platform-admin shell. Gates on `platform_admins` membership for UX;
 * every management RPC re-verifies it server-side.
 */
export default function PlatformShell() {
  return (
    <AdminAuthProvider>
      <PlatformShellInner />
    </AdminAuthProvider>
  )
}

function PlatformShellInner() {
  const { session, loading, logout } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    if (loading) return
    if (!session) {
      navigate('/platform/login', { replace: true, state: { from: location.pathname } })
      return
    }
    let cancelled = false
    const client = getSupabaseClient()
    if (!client) {
      setAuthorized(false)
      return
    }
    isPlatformAdmin(client, session.id).then((ok) => {
      if (!cancelled) setAuthorized(ok)
    })
    return () => {
      cancelled = true
    }
  }, [session, loading, navigate, location.pathname])

  const signOut = async () => {
    await logout()
    navigate('/platform/login', { replace: true })
  }

  if (loading || (session && authorized === null)) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!session) return null

  if (!authorized) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Platform access required</h1>
        <p className="mt-2 text-sm text-muted">
          This account is not a platform administrator. Contact an existing administrator to be
          granted access.
        </p>
        <button type="button" className="btn-primary mt-6" onClick={signOut}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl pb-20 lg:pb-0">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 flex flex-col gap-4">
            <PlatformBadge />
            <SidebarNav onSignOut={signOut} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex items-center justify-between border-b border-border-soft pb-3 lg:hidden">
            <PlatformBadge />
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-brand/10 hover:text-ink"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
          <div className="pt-4 lg:pt-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function PlatformBadge() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <ShieldCheck size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-sm font-bold leading-tight text-ink">JRIQ Platform</p>
        <p className="text-xs text-muted">Administration</p>
      </div>
    </div>
  )
}

function navClass(isActive: boolean) {
  return isActive ? 'bg-brand text-paper' : 'text-ink hover:bg-brand/10'
}

function SidebarNav({ onSignOut }: { onSignOut: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Platform navigation">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${navClass(isActive)}`
          }
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onSignOut}
        className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-brand/10 hover:text-ink"
      >
        <LogOut size={18} aria-hidden="true" />
        Sign out
      </button>
    </nav>
  )
}
