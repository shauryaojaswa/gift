import { Link } from 'react-router-dom'
import { ShieldCheck, Store, Sparkles, Gift, QrCode, LayoutDashboard, Check } from 'lucide-react'

/**
 * JRIQ platform homepage. Answers "what JRIQ is, for jewellers" and offers the
 * platform-admin entry point. NEVER auto-redirects to a shop — this route has no
 * navigation effects by design (pinned by Home.test.tsx). Shop pages live at
 * /{slug}; every printed QR code carries its shop's address.
 */
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-12 py-12">
      <header className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Sparkles size={32} aria-hidden="true" />
        </span>
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">JRIQ</h1>
        <p className="max-w-2xl font-body text-balance text-lg text-muted">
          White-label spin &amp; win rewards for jewellery stores. Every qualifying purchase unlocks
          a gift — chosen fairly from the gifts the shop has approved for that bracket.
        </p>
      </header>

      <section className="grid w-full gap-4 sm:grid-cols-3" aria-label="How it works">
        {[
          {
            icon: QrCode,
            title: '1. Shopper scans',
            text: 'Each shop runs its own branded campaign page and QR code, printed for the counter.',
          },
          {
            icon: Gift,
            title: '2. Server picks the gift',
            text: 'The reward is assigned on the server before the wheel spins — fairly, from the shop-approved pool.',
          },
          {
            icon: Check,
            title: '3. Claim is recorded',
            text: 'Every claim code is stored and verifiable. A claim is a historical fact, never rewritten.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border-soft bg-paper p-6 text-center"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Icon size={20} aria-hidden="true" />
            </span>
            <p className="font-display text-base font-bold text-ink">{title}</p>
            <p className="text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>

      <section className="w-full rounded-2xl border border-border-soft bg-paper p-6" aria-label="For jewellers">
        <h2 className="font-display text-xl font-bold text-ink">For jewellers</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            'Your shop, your branding, your URL — jriq.in/your-shop',
            'Gift pools per purchase bracket, capped and approved by you',
            'Customer entries and claim collection in one dashboard',
            'Fair, server-assigned rewards — no odds manipulation, ever',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-muted">
              <Check size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid w-full gap-4 sm:grid-cols-2" aria-label="Sign in">
        <Link
          to="/platform/login"
          className="group flex flex-col items-center gap-2 rounded-2xl border border-border-soft bg-paper p-6 transition-colors hover:border-brand/40 hover:bg-brand/5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <p className="font-display text-base font-bold text-ink">Platform Admin</p>
          <p className="text-sm text-muted">Provision shops and the gift catalogue</p>
        </Link>

        <Link
          to="/vendor/login"
          className="group flex flex-col items-center gap-2 rounded-2xl border border-border-soft bg-paper p-6 transition-colors hover:border-brand/40 hover:bg-brand/5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Store size={20} aria-hidden="true" />
          </span>
          <p className="font-display text-base font-bold text-ink">Shop Owners</p>
          <p className="text-sm text-muted">Manage gifts, customers and your QR code</p>
        </Link>
      </section>

      <footer className="flex flex-col items-center gap-2 text-center text-xs text-muted">
        <p className="flex items-center gap-1.5">
          <LayoutDashboard size={14} aria-hidden="true" />
          Shopper? Open the page on your shop&apos;s QR code — it goes straight to that shop.
        </p>
        <p>
          Reward assignment happens on the server before the wheel spins — every claim code is
          stored and verifiable.{' '}
          <Link to="/privacy" className="text-brand underline">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  )
}
