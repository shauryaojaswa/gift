import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { getSupabaseClient } from '@/lib/data'
import { getCampaignUrl } from '@/features/vendor/lib'
import {
  createShop,
  linkStoreOwner,
  listShops,
  setStoreStatus,
  type ShopRow,
} from './api'
import { GiftPoolPanel } from './GiftPoolPanel'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const STATUS_BADGE: Record<ShopRow['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-red-100 text-red-800',
  onboarding: 'bg-amber-100 text-amber-800',
}

export default function ShopsPage() {
  const client = getSupabaseClient()
  const [shops, setShops] = useState<ShopRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [qrFor, setQrFor] = useState<string | null>(null)

  // create-shop form
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ url: string; status: string } | null>(null)

  const reload = useCallback(async () => {
    if (!client) return
    try {
      setShops(await listShops(client))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load shops.')
    }
  }, [client])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!client) {
    return (
      <p className="rounded-lg border border-border-soft bg-paper p-4 text-sm text-muted">
        Platform administration requires the persistent Supabase backend.
      </p>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setNotice(null)
    setCreated(null)
    try {
      const result = await createShop(client, {
        name: name.trim(),
        slug: slug.trim(),
        ownerEmail: ownerEmail.trim(),
      })
      setCreated({ url: result.customerPath, status: result.ownerLinkStatus })
      setNotice(
        result.ownerLinkStatus === 'linked'
          ? `Shop created — owner account linked.`
          : `Shop created — owner invitation pending until the owner signs up, then use "Link owner".`,
      )
      setName('')
      setSlug('')
      setSlugTouched(false)
      setOwnerEmail('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create shop.')
    } finally {
      setCreating(false)
    }
  }

  const changeStatus = async (shop: ShopRow, status: ShopRow['status']) => {
    setBusyId(shop.id)
    setError(null)
    try {
      await setStoreStatus(client, shop.id, status)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change shop status.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Shops</h1>
        <p className="text-sm text-muted">
          Provision shops, manage their status and share the customer spin page.
        </p>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {/* Create shop */}
      <section className="rounded-xl border border-border-soft bg-paper p-5">
        <h2 className="font-display text-lg font-bold text-ink">Create shop</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
          <FormField label="Shop name">
            <input
              className="field-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slugTouched) setSlug(slugify(e.target.value))
              }}
              placeholder="Shree Jewellers"
              maxLength={80}
              required
            />
          </FormField>
          <FormField label="URL slug">
            <input
              className="field-input font-mono"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              placeholder="shree-jewellers"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </FormField>
          <FormField label="Owner email">
            <input
              type="email"
              className="field-input"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@shop.com"
              required
            />
          </FormField>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={creating}>
              {creating ? 'Creating…' : 'Create shop'}
            </button>
          </div>
        </form>
        {slug && (
          <p className="mt-2 text-xs text-muted">
            Customer page: <span className="font-mono">{getCampaignUrl(slug)}</span>
          </p>
        )}
        {created && (
          <div className="mt-3 rounded-lg bg-brand/5 px-3 py-2 text-sm text-ink">
            Created <span className="font-mono">{created.url}</span> — owner status:{' '}
            <strong>{created.status}</strong>
          </div>
        )}
      </section>

      {/* Shop list */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-ink">All shops</h2>
        {!shops ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : shops.length === 0 ? (
          <p className="text-sm text-muted">No shops yet — create the first one above.</p>
        ) : (
          shops.map((shop) => (
            <article key={shop.id} className="rounded-xl border border-border-soft bg-paper">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">{shop.name}</p>
                  <p className="truncate text-xs text-muted">
                    <span className="font-mono">{shop.slug}</span> · owner:{' '}
                    {shop.ownerEmail ?? 'none'} ({shop.ownerStatus ?? 'unlinked'})
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[shop.status]}`}
                >
                  {shop.status}
                </span>
                <select
                  className="field-input w-auto py-1.5 text-xs"
                  value={shop.status}
                  disabled={busyId === shop.id}
                  onChange={(e) => void changeStatus(shop, e.target.value as ShopRow['status'])}
                  aria-label={`Status for ${shop.name}`}
                >
                  <option value="active">active</option>
                  <option value="onboarding">onboarding</option>
                  <option value="suspended">suspended</option>
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand/5"
                  onClick={() => setQrFor(qrFor === shop.id ? null : shop.id)}
                >
                  {qrFor === shop.id ? 'Hide QR' : 'Customer URL & QR'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand/5"
                  onClick={() => setExpanded(expanded === shop.id ? null : shop.id)}
                >
                  {expanded === shop.id ? 'Hide gift options' : 'Gift options'}
                </button>
              </div>

              {qrFor === shop.id && <ShopQrPanel slug={shop.slug} />}

              {shop.ownerStatus !== 'linked' && (
                <LinkOwnerForm
                  shop={shop}
                  onLinked={async (message) => {
                    setNotice(message)
                    await reload()
                  }}
                  onError={setError}
                />
              )}

              {expanded === shop.id && (
                <div className="border-t border-border-soft p-4">
                  <GiftPoolPanel storeId={shop.id} />
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  )
}

function ShopQrPanel({ slug }: { slug: string }) {
  const url = getCampaignUrl(slug)
  const [png, setPng] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#49252d', light: '#fffdf9' },
    })
      .then((dataUrl) => {
        if (!cancelled) setPng(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setPng(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border-soft p-4">
      {png ? (
        <img src={png} alt={`QR code for ${url}`} className="h-32 w-32 rounded-lg border border-border-soft" />
      ) : (
        <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-border-soft">
          <Spinner />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted">Customer page</p>
        <p className="break-all font-mono text-sm text-ink">{url}</p>
        {png && (
          <a
            href={png}
            download={`jriq-${slug}-qr.png`}
            className="mt-2 inline-block text-sm font-medium text-brand underline"
          >
            Download QR (PNG)
          </a>
        )}
      </div>
    </div>
  )
}

function LinkOwnerForm({
  shop,
  onLinked,
  onError,
}: {
  shop: ShopRow
  onLinked: (message: string) => Promise<void> | void
  onError: (message: string | null) => void
}) {
  const client = getSupabaseClient()
  const [email, setEmail] = useState(shop.ownerEmail ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return
    setBusy(true)
    onError(null)
    try {
      const status = await linkStoreOwner(client, shop.id, email.trim())
      await onLinked(`Owner for ${shop.name}: ${status}.`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not link owner.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3 border-t border-border-soft p-4" onSubmit={submit}>
      <div className="min-w-56 flex-1">
        <FormField label="Link owner (after the account signs up)">
          <input
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@shop.com"
            required
          />
        </FormField>
      </div>
      <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={busy}>
        {busy ? 'Linking…' : 'Link owner'}
      </button>
    </form>
  )
}
