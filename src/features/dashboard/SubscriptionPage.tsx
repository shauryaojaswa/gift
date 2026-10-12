import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Plan } from '@/types/saas'
import { useDashboard } from './DashboardContext'
import { Button, ErrorNotice, Loading, PageHeader, Panel, StatusPill, SuccessNotice } from '@/components/saas/ui'

export default function SubscriptionPage() {
  const { store, subscription, reload } = useDashboard()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api.getPublicPlans()
      .then((res) => setPlans(res.plans))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }, [])

  if (!store) return null

  const choosePlan = async (planId: string) => {
    setBusy(planId)
    setError(null)
    setNotice(null)
    try {
      const result = await api.checkout(store.id, planId)
      setNotice(`Subscription created with the payment provider (${result.subscriptionId}). It becomes active once the provider confirms payment.`)
      await reload()
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}${e.detail ? ` — ${e.detail}` : ''}` : 'Could not start checkout')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    setBusy('cancel')
    setError(null)
    setNotice(null)
    try {
      await api.cancelSubscription(store.id)
      setNotice('Your subscription has been cancelled. Your records are preserved.')
      await reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader title="Subscription & Billing" description="Your plan, usage and billing status." />

      {notice && <div className="mb-4"><SuccessNotice message={notice} /></div>}
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <Panel className="mb-6 p-5">
        {subscription ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900">{subscription.planName}</h2>
                <StatusPill status={subscription.status} />
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {subscription.status === 'trialing' && subscription.daysRemaining !== null
                  ? `Trial ends in ${subscription.daysRemaining} day${subscription.daysRemaining === 1 ? '' : 's'}.`
                  : subscription.currentPeriodEnd
                    ? `Current period ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}.`
                    : 'Your subscription is being set up.'}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {subscription.usage.submissionsThisMonth.toLocaleString('en-IN')} entries used this month
                {subscription.limits.maxSubmissionsPerMonth !== null && ` of ${subscription.limits.maxSubmissionsPerMonth.toLocaleString('en-IN')}`}.
              </p>
            </div>
            <div className="flex gap-2">
              {subscription.status !== 'cancelled' && subscription.planId !== 'trial' && (
                <Button variant="secondary" size="sm" disabled={busy === 'cancel'} onClick={cancel}>
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No subscription found for this store.</p>
        )}
      </Panel>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Available plans</h2>
      {loading ? (
        <Loading label="Loading plans…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const current = subscription?.planId === plan.id
            return (
              <Panel key={plan.id} className={`flex flex-col p-5 ${current ? 'ring-2 ring-slate-900' : ''}`}>
                <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {plan.price_inr === 0 ? 'Free' : <>₹{plan.price_inr.toLocaleString('en-IN')}<span className="text-sm font-normal text-slate-500">/mo</span></>}
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600">
                  <li>{plan.max_stores === 1 ? '1 store' : `Up to ${plan.max_stores} stores`}</li>
                  <li>{plan.max_submissions_per_month === null ? 'Unlimited entries' : `Up to ${plan.max_submissions_per_month.toLocaleString('en-IN')} entries / month`}</li>
                  {plan.csv_export && <li>CSV export</li>}
                </ul>
                <Button
                  className="mt-4"
                  variant={current ? 'secondary' : 'primary'}
                  disabled={current || plan.price_inr === 0 || busy === plan.id}
                  onClick={() => choosePlan(plan.id)}
                >
                  {current ? 'Current plan' : plan.price_inr === 0 ? 'Included with trial' : busy === plan.id ? 'Starting…' : `Choose ${plan.name}`}
                </Button>
              </Panel>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Payments are handled by the payment provider. Your subscription only becomes active once the provider confirms
        the payment server-side — returning to this page is not treated as proof of payment.
      </p>
    </div>
  )
}
