import { useEffect, useState, useCallback } from 'react'
import { useDataProvider } from '@/providers/DataProviderContext'
import { useAdminAuth } from './AdminContext'
import { Spinner } from '@/components/ui/Spinner'
import { formatINR } from '@/lib/currency'
import type { ListOptions, ListResult, SubmissionRecord } from '@/lib/data'
const PAGE_SIZE = 20

export function SubmissionsPage() {
  const dataProvider = useDataProvider()
  const { session } = useAdminAuth()
  const [submissions, setSubmissions] = useState<ListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [collectingId, setCollectingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'' | 'awaiting' | 'collected'>('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const list = await dataProvider.listSubmissions({
        page,
        pageSize: PAGE_SIZE,
        search,
        collectionStatus: statusFilter || undefined,
      })
      setSubmissions(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }, [page, search, session, statusFilter, dataProvider])

  useEffect(() => {
    load()
  }, [load])

  const downloadCsv = async () => {
    setExporting(true)
    setError(null)
    try {
      const options: Omit<ListOptions, 'page'> = {
        pageSize: 500,
        search,
        collectionStatus: statusFilter || undefined,
      }
      const first = await dataProvider.listSubmissions({ ...options, page: 1 })
      const records = [...first.items]
      for (let currentPage = 2; currentPage <= first.pageCount; currentPage++) {
        const result = await dataProvider.listSubmissions({ ...options, page: currentPage })
        records.push(...result.items)
      }
      const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Customer export failed')
    } finally {
      setExporting(false)
    }
  }

  const markCollected = async (id: string) => {
    setCollectingId(id)
    setError(null)
    try {
      await dataProvider.markSubmissionCollected(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update gift collection status')
    } finally {
      setCollectingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Customers</h2>
        <button
          type="button"
          className="btn-ghost px-3 py-2 text-sm"
          onClick={downloadCsv}
          disabled={exporting || !submissions?.total}
        >
          {exporting ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>

      {/* Search and filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="field-input pl-9"
            placeholder="Search by name, phone, reward…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-label="Search customers"
          />
        </div>
        <button
          type="button"
          className="btn-ghost px-3 py-2 text-sm"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          Filters
          {statusFilter && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-brand" />}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border-soft bg-paper p-3">
          <button
            type="button"
            onClick={() => { setStatusFilter(''); setPage(1) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${!statusFilter ? 'border-brand bg-brand/10 text-brand' : 'border-border-soft text-ink hover:border-brand/40'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter('awaiting'); setPage(1) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === 'awaiting' ? 'border-brand bg-brand/10 text-brand' : 'border-border-soft text-ink hover:border-brand/40'}`}
          >
            Awaiting collection
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter('collected'); setPage(1) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === 'collected' ? 'border-brand bg-brand/10 text-brand' : 'border-border-soft text-ink hover:border-brand/40'}`}
          >
            Collected
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border-soft bg-paper">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Customer</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Phone</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Amount</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Reward</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Date</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {(submissions?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      No submissions found.
                    </td>
                  </tr>
                ) : (
                  submissions?.items.map((r) => (
                    <SubmissionRow
                      key={r.id}
                      row={r}
                      collecting={collectingId === r.id}
                      onCollect={() => markCollected(r.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {submissions && submissions.pageCount > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Page {submissions.page} of {submissions.pageCount} · {submissions.total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-sm"
                  disabled={submissions.page <= 1}
                  onClick={() => setPage(submissions.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-sm"
                  disabled={submissions.page >= submissions.pageCount}
                  onClick={() => setPage(submissions.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SubmissionRow({
  row,
  collecting,
  onCollect,
}: {
  row: SubmissionRecord
  collecting: boolean
  onCollect: () => void
}) {
  return (
    <tr className="border-b border-border-soft last:border-0">
      <td className="px-4 py-2.5 font-medium text-ink">{row.customerName}</td>
      <td className="px-4 py-2.5 text-muted">{row.customerPhone || '—'}</td>
      <td className="px-4 py-2.5">{formatINR(row.purchaseAmount)}</td>
      <td className="px-4 py-2.5 text-muted">{row.rewardLabel}</td>
      <td className="px-4 py-2.5">
        {row.collectionStatus === 'collected' ? (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            Collected
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            Awaiting
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted">
        {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </td>
      <td className="px-4 py-2.5">
        {row.collectionStatus === 'collected' ? (
          <span className="text-xs text-muted">
            {row.collectedAt
              ? new Date(row.collectedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : 'Done'}
          </span>
        ) : (
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={collecting}
            onClick={onCollect}
          >
            {collecting ? 'Saving…' : 'Mark collected'}
          </button>
        )}
      </td>
    </tr>
  )
}

function toCsv(items: SubmissionRecord[]): string {
  const header = ['id', 'customerName', 'customerPhone', 'purchaseAmount', 'rewardLabel', 'claimCode', 'collectionStatus', 'collectedAt', 'reviewCtaShown', 'reviewCtaClicked', 'createdAt']
  const rows = items.map((r) =>
    [
      csvCell(r.id),
      csvCell(r.customerName),
      csvCell(r.customerPhone),
      csvCell(String(r.purchaseAmount)),
      csvCell(r.rewardLabel),
      csvCell(r.couponCode ?? ''),
      csvCell(r.collectionStatus),
      csvCell(r.collectedAt ?? ''),
      r.reviewCtaShown,
      r.reviewCtaClicked,
      csvCell(r.createdAt),
    ].join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

function csvCell(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safeValue.replace(/"/g, '""')}"`
}
