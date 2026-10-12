import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Plan } from '@/types/saas'
import { MarketingShell } from '@/components/saas/MarketingShell'
import { Button, Loading, Panel, ErrorNotice } from '@/components/saas/ui'

function limitLabel(plan: Plan): string {
  if (plan.max_submissions_per_month === null) return 'Unlimited entries'
  return `Up to ${plan.max_submissions_per_month.toLocaleString('en-IN')} entries / month`
}

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    api.getPublicPlans()
      .then((res) => setPlans(res.plans))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load plans'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <MarketingShell>
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Simple pricing that grows with your shop</h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          Start with a 14-day free trial. Upgrade when you are ready. Prices and limits are set by the platform and shown here live.
        </p>
      </div>

      {loading && <Loading />}
      {error && <div className="mt-8"><ErrorNotice message={error} onRetry={load} /></div>}

      {!loading && !error && (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <Panel key={plan.id} className="flex flex-col p-6">
              <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {plan.price_inr === 0 ? 'Free' : <>₹{plan.price_inr.toLocaleString('en-IN')}<span className="text-sm font-normal text-slate-500">/mo</span></>}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {plan.trial_days > 0 ? `${plan.trial_days}-day trial` : `Billed ${plan.billing_interval}ly`}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                <li>{plan.max_stores === 1 ? '1 store' : `Up to ${plan.max_stores} stores`}</li>
                <li>{limitLabel(plan)}</li>
                {plan.csv_export && <li>CSV export</li>}
                {(plan.features ?? []).filter((f) => !/entries|store/i.test(f)).map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link to="/register" className="mt-6">
                <Button variant={plan.id === 'growth' ? 'primary' : 'secondary'} className="w-full">
                  {plan.price_inr === 0 ? 'Start free trial' : `Choose ${plan.name}`}
                </Button>
              </Link>
            </Panel>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-slate-500">
        Prices shown are provisional launch pricing in Indian Rupees and can be changed by the platform administrator.
      </p>
    </MarketingShell>
  )
}
