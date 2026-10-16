import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Spinner } from './components/ui/Spinner'
import NotFound from './features/not-found/NotFound'
import { isRoutableSlug } from './lib/slugs'

const CustomerFlow = lazy(() => import('./features/customer-flow/CustomerFlow'))
const Privacy = lazy(() => import('./features/privacy/Privacy'))
const Standee = lazy(() => import('./features/qr/Standee'))
const Admin = lazy(() => import('./features/admin/AdminShell'))
const AdminLogin = lazy(() => import('./features/admin/AdminLogin'))

const VendorShell = lazy(() => import('./features/vendor/VendorShell'))
const VendorLogin = lazy(() => import('./features/vendor/VendorLogin'))
const VendorLegacyRedirect = lazy(() => import('./features/vendor/VendorLegacyRedirect'))
const VendorOverview = lazy(() => import('./features/vendor/Overview'))
const VendorCustomers = lazy(() => import('./features/vendor/Customers'))
const VendorRewards = lazy(() => import('./features/vendor/Rewards'))
const VendorSettings = lazy(() => import('./features/vendor/Settings'))
const VendorQR = lazy(() => import('./features/vendor/QRPage'))

const Home = lazy(() => import('./features/home/Home'))
const PlatformShell = lazy(() => import('./features/platform/PlatformShell'))
const PlatformLogin = lazy(() => import('./features/platform/PlatformLogin'))
const PlatformShops = lazy(() => import('./features/platform/ShopsPage'))
const PlatformCatalog = lazy(() => import('./features/platform/CatalogPage'))

/**
 * Legacy QR path `/store/:slug` -> `/{slug}`. Permanent and lossless: same shop,
 * same flow, claims untouched. On the MilesWeb build `public/.htaccess` also
 * answers with a real HTTP 301 before the SPA loads; this route covers the
 * GitHub Pages build and any already-loaded SPA session.
 */
function StoreRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={`/${slug ?? ''}`} replace />
}

/**
 * App routes. ORDER DISCIPLINE: every system route above the `/:slug` surface;
 * `/:slug` and `/:slug/admin` are the last real routes; `*` is the designed 404.
 * Root-level slugs can never shadow system routes (router ranks static segments
 * first) and reserved slugs are refused at both layers — see `src/lib/slugs.ts`
 * and the `stores_slug_reserved_check` DB constraint.
 */
export default function App() {
  return (
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        {/* Platform homepage — never auto-redirects to a shop */}
        <Route path="/" element={<Home />} />

        {/* ---- system routes (static segments win over /:slug) ---- */}
        <Route path="/platform/login" element={<PlatformLogin />} />
        <Route path="/platform" element={<PlatformShell />}>
          <Route index element={<Navigate to="/platform/shops" replace />} />
          <Route path="shops" element={<PlatformShops />} />
          <Route path="catalog" element={<PlatformCatalog />} />
        </Route>

        {/* Vendor / shop-owner surfaces */}
        <Route path="/vendor/login" element={<VendorLogin />} />
        {/* Legacy bookmarks redirect into the slug-scoped flow */}
        <Route path="/vendor/*" element={<VendorLegacyRedirect />} />

        {/* Legacy admin (single-shop era) — kept working */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/dashboard/login" element={<Navigate to="/admin/login" replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/admin" replace />} />

        <Route path="/privacy" element={<Privacy />} />
        <Route path="/standee/:slug" element={<Standee />} />

        {/* Legacy customer QR path — permanent redirect to /{slug} */}
        <Route path="/store/:slug" element={<StoreRedirect />} />

        {/* ---- per-shop surface (dead last) ---- */}
        <Route path="/:slug/admin" element={<VendorShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<VendorOverview />} />
          <Route path="customers" element={<VendorCustomers />} />
          <Route path="rewards" element={<VendorRewards />} />
          <Route path="settings" element={<VendorSettings />} />
          <Route path="qr-code" element={<VendorQR />} />
        </Route>
        {/*
          Customer aliases: /{slug}/costumer (as requested by the shop) and
          /{slug}/customer (corrected spelling) render the SAME ShopPage as the
          canonical /{slug} - one shop record, one reward flow, no redirect so
          the requested URL is preserved exactly. QR codes keep pointing at the
          canonical /{slug}.
        */}
        <Route path="/:slug/costumer" element={<ShopPage />} />
        <Route path="/:slug/customer" element={<ShopPage />} />
        <Route path="/:slug" element={<ShopPage />} />

        {/* Designed not-found — never loads a different shop */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

/** Root-level shop entry: validates the slug, then renders the customer flow. */
function ShopPage() {
  const { slug } = useParams<{ slug: string }>()
  if (!isRoutableSlug(slug)) return <NotFound />
  return <CustomerFlow slug={slug} />
}
