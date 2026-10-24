import { Link } from 'react-router-dom'

/**
 * 403 — the signed-in owner opened a shop admin that is not theirs.
 * Zero shop data is rendered. The URL slug is an address, never a key: the
 * backend refuses cross-shop access regardless (store_admins + RLS + RPCs).
 *
 * `onSignOut` gives the visitor a way out: a signed-in owner of another shop
 * must be able to switch to the account that DOES own this shop, without
 * hunting for a sign-out button in a dashboard they did not mean to open.
 */
export default function Forbidden({
  storeSlug,
  onSignOut,
}: {
  storeSlug?: string
  onSignOut?: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 py-16 text-center">
      <p className="font-display text-6xl font-bold tracking-tight text-brand">403</p>
      <h1 className="font-display text-2xl font-bold text-ink">This dashboard belongs to another shop</h1>
      <p className="max-w-md text-balance text-muted">
        Your account is signed in, but it does not administer the shop in this address. No data from
        that shop is shown — and the backend refuses its API surface to you as well.
      </p>
      {onSignOut && (
        <p className="max-w-md text-balance text-sm text-muted">
          Sign out and sign in with this shop&apos;s owner account to manage it.
        </p>
      )}
      {storeSlug && (
        <Link to={`/${storeSlug}/admin/dashboard`} className="btn-primary">
          Open my shop dashboard
        </Link>
      )}
      {onSignOut && (
        <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onSignOut}>
          Sign out and use a different account
        </button>
      )}
      <Link to="/" className="text-sm text-brand underline">
        Back to the JRIQ homepage
      </Link>
    </div>
  )
}
