import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Spinner } from './components/ui/Spinner'

const CustomerFlow = lazy(() => import('./features/customer-flow/CustomerFlow'))
const Privacy = lazy(() => import('./features/privacy/Privacy'))
const Standee = lazy(() => import('./features/qr/Standee'))
const Admin = lazy(() => import('./features/admin/AdminShell'))
const AdminLogin = lazy(() => import('./features/admin/AdminLogin'))

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
        <Route path="*" element={<p className="text-center py-10">Page not found</p>} />
      </Routes>
    </Suspense>
  )
}
