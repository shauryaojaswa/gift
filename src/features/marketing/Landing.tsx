import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { Button, Panel } from '@/components/saas/ui'

const STEPS = [
  { title: 'Scan the QR code', body: 'A customer scans the code at your billing counter and lands on your branded campaign.' },
  { title: 'Enter three details', body: 'Name, purchase amount and phone number. Nothing else is required.' },
  { title: 'Spin & Win', body: 'The wheel reveals the reward your purchase tier has earned.' },
  { title: 'Collect at the counter', body: 'The gift and its claim code are recorded for your staff to hand over.' },
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="saas-root min-h-dvh w-full bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">S</div>
            <span className="text-sm font-semibold text-slate-900">Spin &amp; Win Rewards</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/pricing" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 sm:block">Pricing</Link>
            {user ? (
              <Link to="/dashboard"><Button size="sm">Go to dashboard</Button></Link>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
                <Link to="/register"><Button size="sm">Start free trial</Button></Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              14-day free trial · No card required
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Turn your billing counter into a reward experience
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              A QR code on your counter, a spin of the wheel, and a gift your customer collects before they leave.
              Configure the rewards once — the platform handles the rest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register"><Button>Start free trial</Button></Link>
              <Link to="/login"><Button variant="secondary">Log in</Button></Link>
            </div>
          </div>

          <Panel className="p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer journey</p>
            <ol className="mt-4 space-y-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{index + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{step.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold text-slate-900">Everything you need, in one simple dashboard</h2>
          <p className="mt-2 max-w-2xl text-slate-600">No technical knowledge required. Set it up once and manage it from your phone or computer.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Configure gifts', body: 'Choose what a ₹10,000 purchase earns, what ₹1,00,000 earns, and everything between.' },
              { title: 'See customer entries', body: 'Every name, phone number, purchase amount and reward in one searchable list.' },
              { title: 'Download your QR code', body: 'Print a standee for your counter. The code always points to your live campaign.' },
              { title: 'Track gift collection', body: 'Mark a gift as collected so it is never handed out twice.' },
            ].map((feature) => (
              <Panel key={feature.title} className="p-5">
                <p className="text-sm font-semibold text-slate-900">{feature.title}</p>
                <p className="mt-2 text-sm text-slate-500">{feature.body}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Panel className="flex flex-col items-start justify-between gap-6 bg-slate-900 p-8 text-white sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Ready to see it with your own gifts?</h2>
            <p className="mt-2 text-slate-300">Create your store, configure rewards, and download your QR code in a few minutes.</p>
          </div>
          <Link to="/register"><Button className="bg-white text-slate-900 hover:bg-slate-100">Start free trial</Button></Link>
        </Panel>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} Spin &amp; Win Rewards</span>
          <nav className="flex gap-4">
            <Link to="/pricing" className="hover:text-slate-900">Pricing</Link>
            <Link to="/terms" className="hover:text-slate-900">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-900">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
