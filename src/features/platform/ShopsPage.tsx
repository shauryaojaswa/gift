import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/data'
import {
  downloadDataUrl,
  downloadSvgFile,
  generateQrPng,
  generateQrSvg,
  getCampaignUrl,
} from '@/lib/qr'
import { isReservedSlug, SLUG_PATTERN } from '@/lib/slugs'
import {
  createShop,
  linkStoreOwner,
  listShops,
  setStoreStatus,
  uploadShopLogo,
  type CreateShopResult,
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
  const [query, setQuery] = useState('')

  // create-shop wizard (one screen: name → live slug → logo → owner email)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoName, setLogoName] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreateShopResult | null>(null)

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

  const slugIssue = useMemo(() => {
    const s = slug.trim()
    if (!s) return null
    if (s.length > 60) return 'Use 60 characters or fewer.'
    if (!SLUG_PATTERN.test(s)) return 'Use lowercase letters, numbers and hyphens only.'
    if (isReservedSlug(s)) return 'That address is reserved by the system. Choose another.'
    if (shops?.some((sh) => sh.slug === s)) return 'That address is already used by another shop.'
    return null
  }, [slug, shops])

  const filteredShops = useMemo(() => {
    if (!shops) return null
    const q = query.trim().toLowerCase()
    if (!q) return shops
    return shops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.includes(q) ||
        (s.ownerEmail ?? '').toLowerCase().includes(q),
    )
  }, [shops, query])

  if (!client) {
    return (
      <p className="rounded-lg border border-border-soft bg-paper p-4 text-sm text-muted">
        Platform administration requires the persistent Supabase backend.
      </p>
    )
  }

  const handleLogo = async (file: File) => {
    setLogoBusy(true)
    setError(null)
    try {
      const url = await uploadShopLogo(client, file)
      setLogoUrl(url)
      setLogoName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo upload failed.')
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (slugIssue) return
    setCreating(true)
    setError(null)
    setNotice(null)
    try {
      const result = await createShop(client, {
        name: name.trim(),
        slug: slug.trim(),
        ownerEmail: ownerEmail.trim(),
        logoUrl,
      })
      setCreated(result)
      setName('')
      setSlug('')
      setSlugTouched(false)
      setOwnerEmail('')
      setLogoUrl(null)
      setLogoName(null)
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

      {/* New shop: one-screen wizard → result screen */}
      <section className="rounded-xl border border-border-soft bg-paper p-5">
        {created ? (
          <NewShopResult
            result={created}
            onCreateAnother={() => setCreated(null)}
          />
        ) : (
          <>
            <h2 className="font-display text-lg font-bold text-ink">New shop</h2>
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
              <FormField label="URL slug" hint="Maximum 60 characters. The customer address is jriq.in/{slug}.">
                <input
                  className="field-input font-mono"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(slugify(e.target.value))
                  }}
                  placeholder="shree-jewellers"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={60}
                  required
                  aria-invalid={Boolean(slugIssue)}
                />
              </FormField>
              <FormField
                label="Shop logo"
                hint="Optional now — the owner can upload or change it later. JPG, PNG or WebP up to 5 MB."
              >
                <div className="flex items-center gap-3">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    id="wizard-logo-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleLogo(file)
                    }}
                  />
                  <label
                    htmlFor="wizard-logo-upload"
                    className="btn-secondary inline-flex cursor-pointer items-center justify-center px-4 py-2 text-sm"
                  >
                    {logoBusy ? 'Uploading…' : 'Upload logo'}
                  </label>
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Uploaded shop logo"
                      className="h-12 w-12 rounded-lg border border-border-soft object-contain"
                    />
                  )}
                  {logoName && !logoBusy && (
                    <span className="truncate text-xs text-muted">{logoName}</span>
                  )}
                </div>
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
                <button type="submit" className="btn-primary w-full" disabled={creating || Boolean(slugIssue)}>
                  {creating ? 'Creating…' : 'Create shop'}
                </button>
              </div>
            </form>
            {slug && (
              <p className="mt-2 text-xs text-muted">
                Customer page:{' '}
                <span className="font-mono" data-testid="wizard-customer-url">
                  {getCampaignUrl(slug)}
                </span>
              </p>
            )}
            {slugIssue && (
              <p className="mt-1 text-xs text-red-700" role="alert">
                {slugIssue}
              </p>
            )}
          </>
        )}
      </section>

      {/* Shop list */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">All shops</h2>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, slug or owner"
            aria-label="Search shops"
            className="field-input w-full py-2 text-sm sm:w-72"
          />
        </div>
        {!filteredShops ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : filteredShops.length === 0 ? (
          <p className="text-sm text-muted">
            {query ? 'No shops match your search.' : 'No shops yet — create the first one above.'}
          </p>
        ) : (
          filteredShops.map((shop) => (
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

              {qrFor === shop.id && (
                <div className="border-t border-border-soft p-4">
                  <QrDeliverable slug={shop.slug} />
                </div>
              )}

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

/**
 * Result screen: the three shop deliverables plus an honest owner-link
 * status. The QR downloads are genuinely print-ready (PNG ≥1000px and SVG),
 * and the customer QR decodes to exactly jriq.in/{slug}.
 */
function NewShopResult({
  result,
  onCreateAnother,
}: {
  result: CreateShopResult
  onCreateAnother: () => void
}) {
  const customerUrl = getCampaignUrl(result.shopSlug)
  const adminUrl = `${customerUrl}/admin`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Shop created</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{result.shopName}</span> is ready. Hand over the
          three deliverables below.
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        <li className="rounded-lg border border-border-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">1 · Customer page</p>
          <a
            href={customerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-sm font-medium text-brand underline"
          >
            {customerUrl}
          </a>
        </li>
        <li className="rounded-lg border border-border-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">2 · Vendor admin</p>
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-sm font-medium text-brand underline"
          >
            {adminUrl}
          </a>
          <p className="mt-1 text-xs text-muted">The shop owner signs in here to run the campaign.</p>
        </li>
        <li className="rounded-lg border border-border-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">3 · Printable QR code</p>
          <div className="mt-2">
            <QrDeliverable slug={result.shopSlug} />
          </div>
        </li>
      </ol>

      <div className="rounded-lg bg-brand/5 px-4 py-3 text-sm text-ink">
        {result.ownerLinkStatus === 'linked' ? (
          <>
            Owner account linked — the owner can sign in to the vendor admin now.
          </>
        ) : (
          <>
            Owner link status: <strong>{result.ownerLinkStatus}</strong>. No owner account is
            linked yet — the owner must sign up first, then use “Link owner” on the shop card below.
          </>
        )}
      </div>

      <div>
        <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onCreateAnother}>
          Create another shop
        </button>
      </div>
    </div>
  )
}

/** Customer URL + print-ready QR artefacts (PNG ≥1000px and SVG). */
function QrDeliverable({ slug }: { slug: string }) {
  const url = getCampaignUrl(slug)
  const [png, setPng] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([generateQrPng(url), generateQrSvg(url)])
      .then(([pngUrl, svgText]) => {
        if (!cancelled) {
          setPng(pngUrl)
          setSvg(svgText)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPng(null)
          setSvg(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex flex-wrap items-center gap-4">
      {png ? (
        <img
          src={png}
          alt={`QR code for ${url}`}
          className="h-32 w-32 rounded-lg border border-border-soft"
        />
      ) : (
        <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-border-soft">
          <Spinner />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted">Customer page</p>
        <p className="break-all font-mono text-sm text-ink">{url}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!png}
            onClick={() => png && downloadDataUrl(`${slug}-campaign-qr.png`, png)}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Download QR code
          </button>
          <button
            type="button"
            disabled={!svg}
            onClick={() => svg && downloadSvgFile(`${slug}-campaign-qr.svg`, svg)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Download print SVG
          </button>
        </div>
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
