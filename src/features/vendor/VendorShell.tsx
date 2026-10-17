import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, useParams } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Gift,
  QrCode,
  Settings,
  LogOut,
  Store,
  Info,
} from 'lucide-react'
import { AdminAuthProvider, useAdminAuth } from '@/features/admin/AdminContext'
import { useAdminStore } from '@/features/admin/useAdminStore'
import { dataProviderKind, PERSISTENCE_UNAVAILABLE_MESSAGE } from '@/providers/DataProviderContext'
import { Spinner } from '@/components/ui/Spinner'
import { resolveAssetUrl } from '@/components/ui/StoreLogo'
import { isRenderableLogo } from '@/lib/logo-upload'
import Forbidden from '@/features/not-found/Forbidden'
import NotFound from '@/features/not-found/NotFound'

type NavIcon = typeof LayoutDashboard

interface NavItem {
  to: string
  label: string
  icon: NavIcon
}

function navItems(base: string): NavItem[] {
  return [
    { to: `${base}/dashboard`, label: 'Overview', icon: LayoutDashboard },
    { to: `${base}/customers`, label: 'Customers', icon: Users },
    { to: `${base}/rewards`, label: 'Rewards & Tiers', icon: Gift },
    { to: `${base}/qr-code`, label: 'My QR Code', icon: QrCode },
    { to: `${base}/settings`, label: 'Store Settings', icon: Settings },
  ]
}

export default function VendorShell() {
  return (
    <AdminAuthProvider>
      <VendorShellInner />
    </AdminAuthProvider>
  )
}

function VendorShellInner() {
  const { session, loading, logout } = useAdminAuth()
  const { store, loading: storeLoading } = useAdminStore()
  const navigate = useNavigate()
  const location = useLocation()
  const urlSlug = useParams<{ slug?: string }>().slug
  const persistent = dataProviderKind() === 'supabase'

  useEffect(() => {
    if (!loading && !session) {
      navigate('/vendor/login', { replace: true, state: { from: location.pathname } })
    }
  }, [session, loading, navigate, location.pathname])

  const signOut = async () => {
    await logout()
    navigate('/vendor/login', { replace: true })
  }

  if (loading || (session && storeLoading && urlSlug)) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!session) return null

  // Ownership wall: the URL slug is an address, never a key. Mismatch => 403 with
  // zero shop data. The backend independently refuses cross-shop access
  // (store_admins + RLS + RPC checks), so this is UX, not the security boundary.
  if (urlSlug) {
    if (!store) {
      return <NotFound message="Your account is not linked to a shop yet." />
    }
    if (store.slug !== urlSlug) {
      return <Forbidden storeSlug={store.slug} />
    }
  }

  const base = urlSlug ? `/${urlSlug}/admin` : '/vendor'
  const items = navItems(base)
  const storeName = store?.name ?? 'Your Store'

  return (
    <div className="w-full max-w-6xl pb-20 lg:pb-0">
      {!persistent && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{PERSISTENCE_UNAVAILABLE_MESSAGE}</p>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 flex flex-col gap-4">
            <StoreBadge name={storeName} logoUrl={store?.logoUrl ?? null} />
            <SidebarNav items={items} onSignOut={signOut} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <MobileTopBar storeName={storeName} logoUrl={store?.logoUrl ?? null} onSignOut={signOut} />
          <div className="pt-4 lg:pt-0">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileBottomNav items={items} />
    </div>
  )
}

function StoreBadge({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  // Shop logo (object-fit: contain - never cropped or stretched) with the
  // designed no-logo fallback preserved: shops without a usable logo keep the
  // generic store mark, and a broken logo URL falls back per URL so one shop's
  // failure state can never leak into another shop's badge.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const cleaned = (logoUrl ?? '').trim()
  const showLogo = isRenderableLogo(cleaned) && failedFor !== cleaned

  return (
    <div className="flex items-center gap-2.5">
      {showLogo ? (
        <img
          key={cleaned}
          src={resolveAssetUrl(cleaned)}
          alt=""
          className="h-10 w-10 rounded-lg border border-border-soft bg-white object-contain p-1"
          onError={() => setFailedFor(cleaned)}
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Store size={20} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="font-display text-sm font-bold leading-tight text-ink">{name}</p>
        <p className="text-xs text-muted">Shop Owner</p>
      </div>
    </div>
  )
}

function navClass(isActive: boolean) {
  return isActive
    ? 'bg-brand text-paper'
    : 'text-ink hover:bg-brand/10'
}

function SidebarNav({ items, onSignOut }: { items: NavItem[]; onSignOut: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Vendor navigation">
      {items.map(({ to, label, icon: Icon }) => (
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

function MobileTopBar({ storeName, logoUrl, onSignOut }: { storeName: string; logoUrl?: string | null; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border-soft pb-3 lg:hidden">
      <StoreBadge name={storeName} logoUrl={logoUrl} />
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sign out"
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-brand/10 hover:text-ink"
      >
        <LogOut size={16} aria-hidden="true" />
        Sign out
      </button>
    </div>
  )
}

function MobileBottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-soft bg-paper/95 backdrop-blur lg:hidden"
      aria-label="Vendor navigation"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              isActive ? 'text-brand' : 'text-muted'
            }`
          }
        >
          <Icon size={20} aria-hidden="true" />
          <span className="truncate px-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
