import { useEffect, useState, useMemo } from 'react'
import { useDataProvider } from '@/providers/DataProviderContext'
import { useAdminAuth } from './AdminContext'
import { Spinner } from '@/components/ui/Spinner'
import { formatINR } from '@/lib/currency'
import type { ListResult, SubmissionRecord, AdminStats } from '@/lib/data'

const PAGE_SIZE = 20

export function SubmissionsPage() {
  const dataProvider = useDataProvider()
  const { session } = useAdminAuth()
  const [submissions, setSubmissions] = useState<ListResult | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!session) return
    setLoading(true)
    try {
      const [list, stat] = await Promise.all([
        dataProvider.listSubmissions({ page, pageSize: PAGE_SIZE, search }),
        dataProvider.getStats(),
      ])
      setSubmissions(list)
      setStats(stat)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page, search, session])

  const csv = useMemo(() => toCsv(submissions?.items ?? []), [submissions?.items])

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total submissions" value={stats?.totalSubmissions ?? 0} />
        <StatCard label="Unique customers" value={stats?.totalCustomers ?? 0} />
        <StatCard label="Avg. purchase" value={stats && stats.totalSubmissions ? formatINR(stats.averagePurchaseAmount) : '—'} />
        <StatCard label="Review CTA clicks" value={stats?.reviewCtaClicks ?? 0} />
      </div>

      <div>
        <input
          type="text"
          className="field-input max-w-sm"
          placeholder="Search by name, phone, reward…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border-soft bg-paper">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft bg-ink/3">
                  <th className="px-3 py-2 text-ink">Customer</th>
                  <th className="px-3 py-2 text-ink">Phone</th>
                  <th className="px-3 py-2 text-ink">Amount</th>
                  <th className="px-3 py-2 text-ink">Reward</th>
                  <th className="px-3 py-2 text-ink">Code</th>
                  <th className="px-3 py-2 text-ink">Review</th>
                  <th className="px-3 py-2 text-ink">When</th>
                </tr>
              </thead>
              <tbody>
                {(submissions?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted">
                      No submissions yet.
                    </td>
                  </tr>
                ) : (
                  submissions?.items.map((r) => <SubmissionRow key={r.id} row={r} />)
                )}
              </tbody>
            </table>
          </div>

          {submissions && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Page {submissions.page} of {submissions.pageCount} · {submissions.total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={submissions.page <= 1}
                  onClick={() => setPage(submissions.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={submissions.page >= submissions.pageCount}
                  onClick={() => setPage(submissions.page + 1)}
                >
                  Next
                </button>
                <button type="button" className="btn-secondary" onClick={downloadCsv} disabled={!csv}>
                  Export CSV
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-paper p-4 shadow">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

function SubmissionRow({ row }: { row: SubmissionRecord }) {
  return (
    <tr className="border-b border-border-soft">
      <td className="px-3 py-2 font-medium text-ink">{row.customerName}</td>
      <td className="px-3 py-2 text-muted">{row.customerPhone || '—'}</td>
      <td className="px-3 py-2">{formatINR(row.purchaseAmount)}</td>
      <td className="px-3 py-2">{row.rewardLabel}</td>
      <td className="px-3 py-2 text-muted">{row.couponCode ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        {row.reviewCtaClicked ? 'Clicked' : row.reviewCtaShown ? 'Shown' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-muted">{new Date(row.createdAt).toLocaleString()}</td>
    </tr>
  )
}

function toCsv(items: SubmissionRecord[]): string {
  const header = ['id', 'customerName', 'customerPhone', 'purchaseAmount', 'rewardLabel', 'couponCode', 'reviewCtaShown', 'reviewCtaClicked', 'createdAt']
  const rows = items.map((r) =>
    [
      r.id,
      `"${r.customerName.replace(/"/g, '""')}"`,
      r.customerPhone,
      r.purchaseAmount,
      `"${r.rewardLabel.replace(/"/g, '""')}"`,
      `"${r.couponCode ?? ''}"`,
      r.reviewCtaShown,
      r.reviewCtaClicked,
      r.createdAt,
    ].join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
