import { Navigate, useLocation } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from '@/features/admin/AdminContext'
import { useAdminStore } from '@/features/admin/useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import NotFound from '@/features/not-found/NotFound'

/**
 * Legacy `/vendor/*` bookmarks redirect into the slug-scoped shop admin
 * (`/{slug}/admin/...`). The target slug comes from the authenticated session's
 * store_admins mapping — never from the URL — so the redirect cannot cross
 * tenants.
 */
export default function VendorLegacyRedirect() {
  return (
    <AdminAuthProvider>
      <VendorLegacyRedirectInner />
    </AdminAuthProvider>
  )
}

function VendorLegacyRedirectInner() {
  const { session, loading: authLoading } = useAdminAuth()
  const { store, loading: storeLoading } = useAdminStore()
  const location = useLocation()

  const section = location.pathname.replace(/^\/vendor\/?/, '').replace(/\/+$/, '')

  if (authLoading || (session && storeLoading)) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!session) return <Navigate to="/vendor/login" replace state={{ from: location.pathname }} />
  if (!store) return <NotFound message="Your account is not linked to a shop yet." />
  return <Navigate to={`/${store.slug}/admin/${section || 'dashboard'}`} replace />
}
