import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { CustomerListResult, CustomerRecord } from '@/types/saas'
import { useDashboard } from './DashboardContext'
import { Button, EmptyState, ErrorNotice, Field, Loading, Money, PageHeader, Panel, Select, StatusPill, SuccessNotice, TextInput } from '@/components/saas/ui'

const PAGE_SIZE = 20

function emptyFilters() {
  return { search: '', status: '', reward: '', from: '', to: '', minAmount: '', maxAmount: '' }
}

export default function CustomersPage() {
  const { store, subscription } = useDashboard()
  const [filters, setFilters] = useState(emptyFilters())
  const [applied, setApplied] = useState(emptyFilters())
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<CustomerListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<CustomerRecord | null>(null)

  const load = () => {
    if (!store) return
    setLoading(true)
    setError(null)
    api.listSubmissions(store.id, {
      ...applied,
      minAmount: applied.minAmount ? Number(applied.minAmount) : undefined,
      maxAmount: applied.maxAmount ? Number(applied.maxAmount) : undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load customer records'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [store?.id, page, applied])

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setApplied(filters)
  }

  const resetFilters = () => {
    setFilters(emptyFilters())
    setApplied(emptyFilters())
    setPage(1)
  }

  const markCollected = async (record: CustomerRecord) => {
    if (!store) return
    setNotice(null)
    try {
      await api.collect(store.id, record.id)
      setNotice(`${record.customerName}'s gift has been marked as collected.`)
      setSelected(null)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update this record')
    }
  }

  if (!store) return null

  const canExport = subscription?.limits.csvExport ?? false
  const rewards = Array.from(new Set((result?.items ?? []).map((item) => item.rewardLabel)))

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Every entry from your campaign, searchable and filterable."
        actions={
          canExport ? (
            <a href={api.exportUrl(store.id)} download><Button variant="secondary" size="sm">Export CSV</Button></a>
          ) : (
            <span className="text-xs text-slate-500">CSV export is on Growth and above</span>
          )
        }
      />

      {notice && <div className="mb-4"><SuccessNotice message={notice} /></div>}
      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={load} /></div>}

      <Panel className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={applyFilters}>
          <Field label="Search" htmlFor="search">
            <TextInput id="search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name, phone or claim code" />
          </Field>
          <Field label="Collection status" htmlFor="status">
            <Select id="status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="awaiting">Awaiting collection</option>
              <option value="collected">Collected</option>
            </Select>
          </Field>
          <Field label="Winning gift" htmlFor="reward">
            <TextInput id="reward" value={filters.reward} onChange={(e) => setFilters({ ...filters, reward: e.target.value })} placeholder="e.g. SILVER GIFT" list="reward-options" />
          </Field>
          <Field label="Date from" htmlFor="from">
            <TextInput id="from" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>
          <Field label="Date to" htmlFor="to">
            <TextInput id="to" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>
          <Field label="Min purchase (₹)" htmlFor="min">
            <TextInput id="min" inputMode="numeric" value={filters.minAmount} onChange={(e) => setFilters({ ...filters, minAmount: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Max purchase (₹)" htmlFor="max">
            <TextInput id="max" inputMode="numeric" value={filters.maxAmount} onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">Apply filters</Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
          </div>
        </form>
        <datalist id="reward-options">
          {rewards.map((reward) => <option key={reward} value={reward} />)}
        </datalist>
      </Panel>

      {loading && <Loading label="Loading customer records…" />}

      {!loading && result && result.items.length === 0 && (
        <EmptyState title="No customer records found" description="Try clearing your filters, or wait for the first scan of your QR code." />
      )}

      {!loading && result && result.items.length > 0 && (
        <>
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Purchase</th>
                    <th className="px-4 py-2 font-medium">Reward</th>
                    <th className="px-4 py-2 font-medium">Claim code</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.items.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3">
                        <button type="button" className="text-left" onClick={() => setSelected(record)}>
                          <span className="font-medium text-slate-900 hover:underline">{record.customerName}</span>
                          <span className="block text-xs text-slate-500">{record.customerPhone}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600"><Money amount={record.purchaseAmount} /></td>
                      <td className="px-4 py-3 text-slate-600">{record.rewardLabel}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{record.claimCode ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={record.collectionStatus} label={record.collectionStatus === 'awaiting' ? 'Awaiting' : 'Collected'} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {record.collectionStatus === 'awaiting' ? (
                          <Button size="sm" variant="secondary" onClick={() => markCollected(record)}>Mark collected</Button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {record.collectedAt ? new Date(record.collectedAt).toLocaleDateString('en-IN') : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>{result.total.toLocaleString('en-IN')} records · page {result.page} of {result.pageCount}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= result.pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">{selected.customerName}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Phone" value={selected.customerPhone} />
              <Row label="Purchase amount" value={`₹${selected.purchaseAmount.toLocaleString('en-IN')}`} />
              <Row label="Winning reward" value={selected.rewardLabel} />
              {selected.rewardDescription && <Row label="Description" value={selected.rewardDescription} />}
              {selected.rewardVoucherAmount ? <Row label="Voucher value" value={`₹${selected.rewardVoucherAmount.toLocaleString('en-IN')}`} /> : null}
              <Row label="Claim code" value={selected.claimCode ?? '—'} />
              <Row label="Submitted" value={new Date(selected.createdAt).toLocaleString('en-IN')} />
              <Row label="Collection" value={selected.collectionStatus === 'awaiting' ? 'Awaiting collection' : `Collected${selected.collectedAt ? ` on ${new Date(selected.collectedAt).toLocaleString('en-IN')}` : ''}`} />
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
              {selected.collectionStatus === 'awaiting' && (
                <Button onClick={() => markCollected(selected)}>Mark collected</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  )
}
