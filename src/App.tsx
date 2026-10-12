import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Spinner } from './components/ui/Spinner'
import { useAuth } from './features/auth/AuthContext'

const CustomerFlow = lazy(() => import('./features/customer-flow/CustomerFlow'))
const Standee = lazy(() => import('./features/qr/Standee'))
const Landing = lazy(() => import('./features/marketing/Landing'))
const Pricing = lazy(() => import('./features/marketing/Pricing'))
const Login = lazy(() => import('./features/auth/Login'))
const Register = lazy(() => import('./features/auth/Register'))
const Onboarding = lazy(() => import('./features/onboarding/Onboarding'))
const DashboardShell = lazy(() => import('./features/dashboard/DashboardShell'))
const OverviewPage = lazy(() => import('./features/dashboard/OverviewPage'))
const CustomersPage = lazy(() => import('./features/dashboard/CustomersPage'))
const GiftsPage = lazy(() => import('./features/dashboard/GiftsPage'))
const QrPage = lazy(() => import('./features/dashboard/QrPage'))
const StoreSettingsPage = lazy(() => import('./features/dashboard/StoreSettingsPage'))
const SubscriptionPage = lazy(() => import('./features/dashboard/SubscriptionPage'))
const PlatformAdmin = lazy(() => import('./features/platform-admin/PlatformAdmin'))
const Terms = lazy(() => import('./features/legal/Terms'))
const PrivacyPolicy = lazy(() => import('./features/legal/PrivacyPolicy'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner fullScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  const { user, isPlatformAdmin, loading } = useAuth()
  if (loading) return <Spinner fullScreen />
  if (!user) return <Navigate to="/login" replace />
  // Platform-admin access is verified server-side; this guard only avoids rendering the shell.
  if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

        <Route path="/dashboard" element={<RequireAuth><DashboardShell /></RequireAuth>}>
          <Route index element={<OverviewPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="gifts" element={<GiftsPage />} />
          <Route path="qr" element={<QrPage />} />
          <Route path="settings" element={<StoreSettingsPage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
        </Route>

        <Route path="/platform-admin" element={<RequirePlatformAdmin><PlatformAdmin /></RequirePlatformAdmin>} />

        {/* Public customer campaign */}
        <Route path="/store/:slug" element={<CustomerFlow />} />
        <Route path="/standee/:slug" element={<Standee />} />

        <Route path="/admin/*" element={<Navigate to="/dashboard" replace />} />

        <Route path="*" element={<p className="text-center py-10">Page not found</p>} />
      </Routes>
    </Suspense>
  )
}
