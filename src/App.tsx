import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Spinner } from './components/ui/Spinner'

const CustomerFlow = lazy(() => import('./features/customer-flow/CustomerFlow'))
const Privacy = lazy(() => import('./features/privacy/Privacy'))
const Standee = lazy(() => import('./features/qr/Standee'))
const Admin = lazy(() => import('./features/admin/AdminShell'))
const AdminLogin = lazy(() => import('./features/admin/AdminLogin'))

const VendorShell = lazy(() => import('./features/vendor/VendorShell'))
const VendorLogin = lazy(() => import('./features/vendor/VendorLogin'))
const VendorOverview = lazy(() => import('./features/vendor/Overview'))
const VendorCustomers = lazy(() => import('./features/vendor/Customers'))
const VendorRewards = lazy(() => import('./features/vendor/Rewards'))
const VendorSettings = lazy(() => import('./features/vendor/Settings'))
const VendorQR = lazy(() => import('./features/vendor/QRPage'))

export default function App() {
  return (
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/store/jolly-enterprises" replace />} />
        <Route path="/store/:slug" element={<CustomerFlow />} />
        <Route path="/standee/:slug" element={<Standee />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<Admin />} />
        {/* Legacy dashboard URLs keep working as redirects */}
        <Route path="/dashboard/login" element={<Navigate to="/admin/login" replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/admin" replace />} />

        {/* Vendor / shop-owner dashboard */}
        <Route path="/vendor/login" element={<VendorLogin />} />
        <Route path="/vendor" element={<VendorShell />}>
          <Route index element={<Navigate to="/vendor/dashboard" replace />} />
          <Route path="dashboard" element={<VendorOverview />} />
          <Route path="customers" element={<VendorCustomers />} />
          <Route path="rewards" element={<VendorRewards />} />
          <Route path="settings" element={<VendorSettings />} />
          <Route path="qr-code" element={<VendorQR />} />
        </Route>

        <Route path="*" element={<p className="text-center py-10">Page not found</p>} />
      </Routes>
    </Suspense>
  )
}
