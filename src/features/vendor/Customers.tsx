import { useEffect, useState, useCallback } from 'react'
import { Search, Download, X, PackageCheck } from 'lucide-react'
import type { SubmissionRecord } from '@/lib/data'
import { useAdminStore } from '@/features/admin/useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { formatINR } from '@/lib/currency'
import { formatDateTime, toCsv, downloadText } from './lib'

const PAGE_SIZE = 10
type StatusFilter = 'all' | 'awaiting' | 'collected'

const CSV_COLUMNS = [
  { header: 'Customer', value: (r: SubmissionRecord) => r.customerName },
  { header: 'Phone', value: (r: SubmissionRecord) => r.customerPhone },
  { header: 'Purchase Amount (INR)', value: (r: SubmissionRecord) => r.purchaseAmount },
  { header: 'Reward', value: (r: SubmissionRecord) => r.rewardLabel },
  { header: 'Claim Code', value: (r: SubmissionRecord) => r.couponCode ?? '' },
  { header: 'Status', value: (r: SubmissionRecord) => (r.collection.status === 'collected' ? 'Collected' : 'Awaiting') },
  { header: 'Submitted', value: (r: SubmissionRecord) => r.createdAt },
  { header: 'Collected At', value: (r: SubmissionRecord) => r.collection.collectedAt ?? '' },
  { header: 'Collected By', value: (r: SubmissionRecord) => r.collection.collectedBy ?? '' },
]

export default function Customers() {
  const { dataProvider, session } = useAdminStore()
  const [rows, setRows] = useState<SubmissionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SubmissionRecord | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Debounce the search input so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const res = await dataProvider.listSubmissions({ page, pageSize: PAGE_SIZE, search: debouncedSearch })
      const filtered =
        status === 'all'
          ? res.items
          : res.items.filter((r) => r.collection.status === status)
      setRows(filtered)
      setTotal(res.total)
      setPageCount(res.pageCount)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [dataProvider, session, page, debouncedSearch, status])

  useEffect(() => {
    void load()
  }, [load])

  const markCollected = async (row: SubmissionRecord) => {
    setBusyId(row.id)
    try {
      const updated = await dataProvider.setCollectionStatus(row.id, 'collected', {
        collectedBy: session?.email ?? null,
      })
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      if (selected?.id === row.id) setSelected(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark as collected')
    } finally {
      setBusyId(null)
    }
  }

  const exportCsv = () => {
    const csv = toCsv(rows, CSV_COLUMNS)
    downloadText(`customers-page-${page}.csv`, csv)
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Customers</h1>
          <p className="mt-1 text-sm text-muted">
            {total} submission{total === 1 ? '' : 's'} recorded.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-lg border border-border-soft bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand/40 disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          Export CSV
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, reward or code"
            className="field-input w-full py-2.5 pl-9 pr-3 text-sm"
            aria-label="Search customers"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filter by collection status">
          {(['all', 'awaiting', 'collected'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatus(s)
                setPage(1)
              }}
              aria-pressed={status === s}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium capitalize transition-colors ${
                status === s ? 'bg-brand text-paper' : 'border border-border-soft bg-paper text-ink hover:border-brand/40'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border-soft bg-paper px-6 py-10 text-center text-sm text-muted">
          No customers match your filters.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border-soft bg-paper sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Reward</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border-soft">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {r.customerName}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-ink">{r.customerPhone}</td>
                    <td className="px-4 py-2.5 text-ink">{formatINR(r.purchaseAmount)}</td>
                    <td className="px-4 py-2.5 text-ink">{r.rewardLabel}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.collection.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {r.collection.status === 'collected' ? (
                        <span className="text-xs text-muted">Collected</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markCollected(r)}
                          disabled={busyId === r.id}
                          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
                        >
                          {busyId === r.id ? 'Saving…' : 'Mark collected'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-3 sm:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-border-soft bg-paper px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="text-left text-sm font-medium text-ink"
                  >
                    {r.customerName}
                  </button>
                  <StatusBadge status={r.collection.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {r.customerPhone} · {formatINR(r.purchaseAmount)}
                </p>
                <p className="mt-0.5 text-xs text-ink">{r.rewardLabel}</p>
                {r.collection.status === 'collected' ? (
                  <p className="mt-2 text-xs text-muted">
                    Collected {formatDateTime(r.collection.collectedAt)}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => markCollected(r)}
                    disabled={busyId === r.id}
                    className="mt-2 flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
                  >
                    <PackageCheck size={14} aria-hidden="true" />
                    {busyId === r.id ? 'Saving…' : 'Mark collected'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-border-soft bg-paper px-3.5 py-2 font-medium text-ink disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-muted">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="rounded-lg border border-border-soft bg-paper px-3.5 py-2 font-medium text-ink disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <CustomerDrawer
          record={selected}
          onClose={() => setSelected(null)}
          onMarkCollected={markCollected}
          busy={busyId === selected.id}
        />
      )}
    </div>
  )
}


function StatusBadge({ status }: { status: 'awaiting' | 'collected' }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'collected' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {status === 'collected' ? 'Collected' : 'Awaiting'}
    </span>
  )
}

function CustomerDrawer({
  record,
  onClose,
  onMarkCollected,
  busy,
}: {
  record: SubmissionRecord
  onClose: () => void
  onMarkCollected: (r: SubmissionRecord) => void
  busy: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const fields: Array<[string, string]> = [
    ['Customer', record.customerName],
    ['Phone', record.customerPhone],
    ['Purchase amount', formatINR(record.purchaseAmount)],
    ['Reward', record.rewardLabel],
    ['Claim code', record.couponCode ?? '—'],
    ['Submitted', formatDateTime(record.createdAt) || '—'],
    ['Collected at', formatDateTime(record.collection.collectedAt) || '—'],
    ['Collected by', record.collection.collectedBy ?? '—'],
  ]

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Customer detail">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-paper p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold text-ink">{record.customerName}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <StatusBadge status={record.collection.status} />

        <dl className="flex flex-col divide-y divide-border-soft text-sm">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        {record.collection.status !== 'collected' && (
          <button
            type="button"
            onClick={() => onMarkCollected(record)}
            disabled={busy}
            className="btn-primary mt-2"
          >
            {busy ? 'Saving…' : 'Mark gift collected'}
          </button>
        )}
      </div>
    </div>
  )
}

