import { Link } from 'react-router-dom'
import { ShieldCheck, Store, Sparkles } from 'lucide-react'
import { JOLLY_ENTERPRISES_SLUG } from '@/lib/stores'

/**
 * JRIQ platform landing. White-label jewellery rewards: shoppers spin to win a
 * gift from their purchase bracket, shop owners manage their campaign, and the
 * platform team provisions everything centrally.
 */
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10 py-12 text-center">
      <header className="flex flex-col items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Sparkles size={32} aria-hidden="true" />
        </span>
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          JRIQ
        </h1>
        <p className="max-w-xl font-body text-balance text-muted">
          White-label spin &amp; win rewards for jewellery stores. Every qualifying purchase
          unlocks a gift — chosen fairly from the gifts the shop has approved for that bracket.
        </p>
      </header>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        <Link
          to={`/store/${JOLLY_ENTERPRISES_SLUG}`}
          className="group flex flex-col items-center gap-2 rounded-2xl border border-border-soft bg-paper p-6 transition-colors hover:border-brand/40 hover:bg-brand/5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <p className="font-display text-base font-bold text-ink">Spin &amp; Win</p>
          <p className="text-sm text-muted">Open a shop&rsquo;s customer spin page</p>
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
      </div>

      <footer className="text-xs text-muted">
        Reward assignment happens on the server before the wheel spins — every claim code is
        stored and verifiable.{' '}
        <Link to="/privacy" className="text-brand underline">
          Privacy
        </Link>
      </footer>
    </div>
  )
}
