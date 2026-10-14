import { useEffect, useState } from 'react'
import { useDataProvider } from '@/providers/DataProviderContext'
import { useAdminAuth } from './AdminContext'
import { formatINR } from '@/lib/currency'
import type { AdminStats, SubmissionRecord } from '@/lib/data'

type Shortcut = 'customers' | 'campaign' | 'qr'

export function DashboardOverview({ onNavigate }: { onNavigate: (section: Shortcut) => void }) {
  const dataProvider = useDataProvider()
  const { session } = useAdminAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [recent, setRecent] = useState<SubmissionRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    Promise.all([
      dataProvider.getStats(),
      dataProvider.listSubmissions({ page: 1, pageSize: 5, search: '' }),
    ]).then(([nextStats, nextRecent]) => {
      if (!cancelled) {
        setStats(nextStats)
        setRecent(nextRecent.items)
        setError(null)
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Overview could not be loaded')
    })
    return () => {
      cancelled = true
    }
  }, [dataProvider, session])

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total customers" value={stats?.totalSubmissions ?? '—'} />
        <StatCard label="Gifts awaiting collection" value={stats?.awaitingCollection ?? '—'} />
        <StatCard label="Gifts collected" value={stats?.collectedGifts ?? '—'} />
        <StatCard label="Total purchase value" value={stats ? formatINR(stats.totalPurchaseValue) : '—'} />
      </div>

      {/* Recent customers */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Recent customers</h2>
          <button
            type="button"
            onClick={() => onNavigate('customers')}
            className="text-sm font-medium text-brand hover:underline"
          >
            View all
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border-soft bg-paper">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-sm text-muted">No customer submissions yet.</p>
              <button
                type="button"
                className="btn-secondary max-w-xs text-sm"
                onClick={() => onNavigate('qr')}
              >
                Get your QR code
              </button>
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Customer</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Purchase</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Reward</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((record) => (
                  <tr key={record.id} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{record.customerName}</td>
                    <td className="px-4 py-2.5">{formatINR(record.purchaseAmount)}</td>
                    <td className="px-4 py-2.5 text-muted">{record.rewardLabel}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={record.collectionStatus} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {new Date(record.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction onClick={() => onNavigate('campaign')} title="Edit gifts" description="Manage rewards and purchase tiers" />
        <QuickAction onClick={() => onNavigate('customers')} title="View customers" description="Search and mark gifts collected" />
        <QuickAction onClick={() => onNavigate('qr')} title="Download QR" description="Get your campaign QR code" />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border-soft bg-paper p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: 'awaiting' | 'collected' }) {
  return status === 'collected' ? (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      Collected
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      Awaiting
    </span>
  )
}

function QuickAction({ onClick, title, description }: { onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-xl border border-border-soft bg-paper p-4 text-left shadow-sm transition-colors hover:border-brand/30 hover:bg-brand/5"
    >
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-xs text-muted">{description}</span>
    </button>
  )
}
