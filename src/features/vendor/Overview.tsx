import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Gift, Package, PackageCheck, IndianRupee, TrendingUp } from 'lucide-react'
import { useAdminStore } from '@/features/admin/useAdminStore'
import type { AdminStats, SubmissionRecord } from '@/lib/data'
import { formatINR, formatINRNumber } from '@/lib/currency'
import { formatDateTime } from './lib'
import { Spinner } from '@/components/ui/Spinner'

export default function Overview() {
  const { dataProvider, session } = useAdminStore()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [recent, setRecent] = useState<SubmissionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [s, list] = await Promise.all([
          dataProvider.getStats(),
          dataProvider.listSubmissions({ page: 1, pageSize: 5, search: '' }),
        ])
        if (cancelled) return
        setStats(s)
        setRecent(list.items)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataProvider, session])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (error) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {error}
      </p>
    )
  }
  if (!stats) return null

  const cards = [
    { label: 'Total entries', value: formatINRNumber(stats.totalSubmissions), icon: Users, accent: 'text-brand' },
    { label: 'Rewards issued', value: formatINRNumber(stats.totalSubmissions), icon: Gift, accent: 'text-brand' },
    { label: 'Awaiting collection', value: formatINRNumber(stats.awaitingCollection), icon: Package, accent: 'text-amber-600' },
    { label: 'Gifts collected', value: formatINRNumber(stats.collected), icon: PackageCheck, accent: 'text-emerald-600' },
    { label: 'Total purchase value', value: formatINR(stats.totalPurchaseValue), icon: IndianRupee, accent: 'text-brand' },
    { label: 'Unique customers', value: formatINRNumber(stats.totalCustomers), icon: TrendingUp, accent: 'text-brand' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-muted">A snapshot of your campaign performance.</p>
      </header>

      {stats.totalSubmissions === 0 ? (
        <div className="rounded-xl border border-border-soft bg-paper px-6 py-10 text-center">
          <Gift size={32} className="mx-auto mb-3 text-muted" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-ink">No submissions yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Once customers complete the Spin &amp; Win journey, their entries and rewards will appear
            here automatically.
          </p>
          <Link
            to="/vendor/qr-code"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-paper"
          >
            Share your campaign QR
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.map(({ label, value, icon: Icon, accent }) => (
              <div key={label} className="rounded-xl border border-border-soft bg-paper px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">{label}</p>
                  <Icon size={18} className={accent} aria-hidden="true" />
                </div>
                <p className="mt-2 font-display text-xl font-bold text-ink">{value}</p>
              </div>
            ))}
          </div>

          <section aria-labelledby="recent-heading" className="rounded-xl border border-border-soft bg-paper">
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <h2 id="recent-heading" className="font-display text-base font-semibold text-ink">
                Recent activity
              </h2>
              <Link to="/vendor/customers" className="text-sm font-medium text-brand underline">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Reward</th>
                    <th className="px-4 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-t border-border-soft">
                      <td className="px-4 py-2.5 text-ink">{r.customerName}</td>
                      <td className="px-4 py-2.5 text-ink">{formatINR(r.purchaseAmount)}</td>
                      <td className="px-4 py-2.5 text-ink">{r.rewardLabel}</td>
                      <td className="px-4 py-2.5 text-muted">{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <nav className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Quick links">
            <QuickLink to="/vendor/customers" label="Customers" icon={Users} />
            <QuickLink to="/vendor/rewards" label="Rewards & Tiers" icon={Gift} />
            <QuickLink to="/vendor/qr-code" label="My QR Code" icon={Package} />
            <QuickLink to="/vendor/settings" label="Store Settings" icon={TrendingUp} />
          </nav>
        </>
      )}
    </div>
  )
}

function QuickLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Users }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-xl border border-border-soft bg-paper px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-brand/40 hover:bg-brand/5"
    >
      <Icon size={18} className="text-brand" aria-hidden="true" />
      {label}
    </Link>
  )
}

