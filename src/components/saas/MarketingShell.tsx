import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { Button } from '@/components/saas/ui'

export function MarketingShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <div className="saas-root min-h-dvh w-full bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">S</div>
            <span className="text-sm font-semibold text-slate-900">Spin &amp; Win Rewards</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/pricing" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 sm:block">Pricing</Link>
            {user ? (
              <Link to="/dashboard"><Button size="sm">Dashboard</Button></Link>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
                <Link to="/register"><Button size="sm">Start free trial</Button></Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">{children}</main>
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
