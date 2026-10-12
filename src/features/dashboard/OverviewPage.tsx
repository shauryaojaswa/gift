import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { DashboardStats } from '@/types/saas'
import { useDashboard } from './DashboardContext'
import { Button, EmptyState, ErrorNotice, Loading, Money, PageHeader, Panel, StatCard, StatusPill } from '@/components/saas/ui'

export default function OverviewPage() {
  const { store, subscription } = useDashboard()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    if (!store) return
    setLoading(true)
    setError(null)
    api.getStats(store.id)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your summary'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [store?.id])

  if (!store) return null

  return (
    <div>
      <PageHeader
        title={`Welcome back`}
        description={store.name ? `Here is how ${store.name} is doing.` : 'Set your store name in Store Settings.'}
        actions={
          <>
            <Link to="/dashboard/gifts"><Button variant="secondary" size="sm">Edit gifts</Button></Link>
            <Link to="/dashboard/customers"><Button variant="secondary" size="sm">View customers</Button></Link>
            <Link to="/dashboard/qr"><Button variant="secondary" size="sm">Download QR</Button></Link>
            <Link to="/dashboard/settings"><Button size="sm">Store settings</Button></Link>
          </>
        }
      />

      {subscription?.status === 'trialing' && subscription.daysRemaining !== null && (
        <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Your free trial ends in {subscription.daysRemaining} day{subscription.daysRemaining === 1 ? '' : 's'}.{' '}
          <Link to="/dashboard/subscription" className="font-medium underline">Choose a plan</Link>
        </div>
      )}

      {loading && <Loading label="Loading your summary…" />}
      {error && <ErrorNotice message={error} onRetry={load} />}

      {!loading && stats && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Customer entries" value={stats.totalEntries.toLocaleString('en-IN')} />
            <StatCard label="Purchase value" value={`₹${stats.totalPurchaseValue.toLocaleString('en-IN')}`} />
            <StatCard label="Customers" value={stats.totalCustomers.toLocaleString('en-IN')} />
            <StatCard label="Awaiting collection" value={stats.awaitingCollection.toLocaleString('en-IN')} />
            <StatCard label="Collected" value={stats.collected.toLocaleString('en-IN')} />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Latest customer entries</h2>
              <Link to="/dashboard/customers" className="text-sm text-slate-600 hover:text-slate-900">View all</Link>
            </div>
            {stats.recentEntries.length === 0 ? (
              <EmptyState
                title="No customer entries yet"
                description="Print your QR code and place it at the billing counter to start collecting entries."
                action={<Link to="/dashboard/qr"><Button size="sm">Get your QR code</Button></Link>}
              />
            ) : (
              <Panel className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Customer</th>
                        <th className="px-4 py-2 font-medium">Purchase</th>
                        <th className="px-4 py-2 font-medium">Reward</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.recentEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">{entry.customerName}</span>
                            <span className="block text-xs text-slate-500">{entry.customerPhone}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600"><Money amount={entry.purchaseAmount} /></td>
                          <td className="px-4 py-3 text-slate-600">{entry.rewardLabel}</td>
                          <td className="px-4 py-3"><StatusPill status={entry.collectionStatus} label={entry.collectionStatus === 'awaiting' ? 'Awaiting' : 'Collected'} /></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
