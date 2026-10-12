import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Plan, PlatformMetrics, PlatformStore } from '@/types/saas'
import { useAuth } from '@/features/auth/AuthContext'
import { Button, EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel, Select, StatCard, StatusPill, SuccessNotice, TextInput } from '@/components/saas/ui'

type Tab = 'overview' | 'stores' | 'plans'

export default function PlatformAdmin() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [stores, setStores] = useState<PlatformStore[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([api.adminMetrics(), api.adminStores(), api.adminPlans()])
      .then(([m, s, p]) => {
        setMetrics(m)
        setStores(s.stores)
        setPlans(p.plans)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load platform data'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const runAction = async (storeId: string, body: Parameters<typeof api.adminUpdateStore>[1], message: string) => {
    setNotice(null)
    setError(null)
    try {
      await api.adminUpdateStore(storeId, body)
      setNotice(message)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed')
    }
  }

  const filtered = stores.filter((store) => {
    if (!search) return true
    const term = search.toLowerCase()
    return store.name.toLowerCase().includes(term) || store.slug.toLowerCase().includes(term)
  })

  return (
    <div className="saas-root min-h-dvh w-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">P</div>
            <span className="text-sm font-semibold text-slate-900">Platform administration</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:block">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => { void logout() }}>Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex gap-2">
          {(['overview', 'stores', 'plans'] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === item ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {item}
            </button>
          ))}
        </div>

        {notice && <div className="mb-4"><SuccessNotice message={notice} /></div>}
        {error && <div className="mb-4"><ErrorNotice message={error} onRetry={load} /></div>}
        {loading && <Loading />}

        {!loading && tab === 'overview' && metrics && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Registered shops" value={String(metrics.totalStores)} />
              <StatCard label="Monthly recurring revenue" value={`₹${metrics.mrrInr.toLocaleString('en-IN')}`} sub="Active subscriptions only" />
              <StatCard label="Trialing" value={String(metrics.trialing)} sub={`${metrics.expiringTrials} ending within 7 days`} />
              <StatCard label="Past due" value={String(metrics.pastDue)} />
              <StatCard label="Active" value={String(metrics.active)} />
              <StatCard label="Cancelled" value={String(metrics.cancelled)} />
              <StatCard label="Expired" value={String(metrics.expired)} />
              <StatCard label="Total customer entries" value={metrics.totalSubmissions.toLocaleString('en-IN')} />
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent onboarding activity</h2>
              <Panel className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Store</th>
                        <th className="px-4 py-2 font-medium">Plan</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {metrics.recentActivity.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">{row.name || 'Unnamed store'}</span>
                            <span className="block text-xs text-slate-500">/store/{row.slug}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.plan_id ?? '—'}</td>
                          <td className="px-4 py-3">{row.subscription_status ? <StatusPill status={row.subscription_status} /> : '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {!loading && tab === 'stores' && (
          <div>
            <PageHeader
              title="Registered shops"
              description="Manage plan, trial and account status for every store."
              actions={<TextInput placeholder="Search stores" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />}
            />
            {filtered.length === 0 ? (
              <EmptyState title="No stores found" />
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((store) => (
                  <Panel key={store.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{store.name || 'Unnamed store'}</span>
                          <StatusPill status={store.subscription_status ?? 'active'} />
                          {store.status === 'suspended' && <StatusPill status="suspended" label="Account suspended" />}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          /store/{store.slug} · {store.submission_count} entries · plan {store.plan_id ?? '—'}
                          {store.trial_ends_at ? ` · trial ends ${new Date(store.trial_ends_at).toLocaleDateString('en-IN')}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          className="w-36"
                          value={store.plan_id ?? ''}
                          onChange={(e) => runAction(store.id, { planId: e.target.value }, `Plan updated for ${store.name || store.slug}.`)}
                        >
                          <option value="" disabled>Change plan</option>
                          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                        </Select>
                        <Select
                          className="w-36"
                          value={store.subscription_status ?? ''}
                          onChange={(e) => runAction(store.id, { subscriptionStatus: e.target.value }, `Subscription status updated for ${store.name || store.slug}.`)}
                        >
                          <option value="" disabled>Status</option>
                          {['trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended'].map((status) => (
                            <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                          ))}
                        </Select>
                        <Button size="sm" variant="secondary" onClick={() => runAction(store.id, { extendTrialDays: 7 }, `Trial extended by 7 days for ${store.name || store.slug}.`)}>
                          Extend trial 7d
                        </Button>
                        {store.status === 'suspended' ? (
                          <Button size="sm" variant="secondary" onClick={() => runAction(store.id, { status: 'active' }, `${store.name || store.slug} reactivated.`)}>Reactivate</Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => runAction(store.id, { status: 'suspended' }, `${store.name || store.slug} suspended.`)}>Suspend</Button>
                        )}
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'plans' && (
          <div>
            <PageHeader title="Plans & pricing" description="Change prices and limits. These drive the public pricing page." />
            <div className="flex flex-col gap-4">
              {plans.map((plan) => (
                <PlanEditor key={plan.id} plan={plan} onSaved={(message) => { setNotice(message); load() }} onError={setError} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanEditor({ plan, onSaved, onError }: { plan: Plan; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const [price, setPrice] = useState(String(plan.price_inr))
  const [maxSubmissions, setMaxSubmissions] = useState(plan.max_submissions_per_month === null ? '' : String(plan.max_submissions_per_month))
  const [maxStores, setMaxStores] = useState(String(plan.max_stores))
  const [csvExport, setCsvExport] = useState(plan.csv_export)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api.adminUpdatePlan(plan.id, {
        priceInr: Number(price) || 0,
        maxStores: Number(maxStores) || 1,
        maxSubmissionsPerMonth: maxSubmissions === '' ? null : Number(maxSubmissions),
        csvExport,
      })
      onSaved(`${plan.name} updated.`)
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not update plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-32 flex-1">
          <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
          <p className="text-xs text-slate-500">{plan.billing_interval}ly · {plan.trial_days > 0 ? `${plan.trial_days}-day trial` : 'no trial'}</p>
        </div>
        <Field label="Price (₹)"><TextInput className="w-28" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Max stores"><TextInput className="w-24" inputMode="numeric" value={maxStores} onChange={(e) => setMaxStores(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Entries / month" hint="Blank = unlimited"><TextInput className="w-32" inputMode="numeric" value={maxSubmissions} onChange={(e) => setMaxSubmissions(e.target.value.replace(/\D/g, ''))} /></Field>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={csvExport} onChange={(e) => setCsvExport(e.target.checked)} />
          CSV export
        </label>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </Panel>
  )
}
