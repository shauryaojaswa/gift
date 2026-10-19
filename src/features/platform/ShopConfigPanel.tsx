import { useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/data'
import { getCampaignUrl } from '@/lib/qr'
import { isReservedSlug, SLUG_PATTERN } from '@/lib/slugs'
import {
  renameStoreSlug,
  saveStoreReviewLink,
  setStoreReviewPolicy,
  updateShopBranding,
  updateShopLogo,
  type ShopRow,
} from './api'
import { QrDeliverable } from './QrDeliverable'
import { FormField } from '@/components/ui/FormField'

/**
 * Per-shop configuration surface (platform admin). One place to do the whole
 * admin workflow for a shop: branding + logo, name/slug, the clearly labelled
 * Google Review Link panel, owner invitation status, and the customer/login
 * links with the print-ready QR. Server-side rules (https review URLs, price
 * policy, owner permissions) live in the database; this panel surfaces them.
 */
export function ShopConfigPanel({
  shop,
  onChanged,
  onNotice,
  onError,
}: {
  shop: ShopRow
  onChanged: () => Promise<void> | void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const client = getSupabaseClient()
  const [name, setName] = useState(shop.name)
  const [subtitle, setSubtitle] = useState(shop.subtitle ?? '')
  const [primaryColor, setPrimaryColor] = useState(shop.primaryColor ?? '')
  const [secondaryColor, setSecondaryColor] = useState(shop.secondaryColor ?? '')
  const [campaignBadge, setCampaignBadge] = useState(shop.campaignBadge ?? '')
  const [minSpinAmount, setMinSpinAmount] = useState(String(shop.minSpinAmount))
  const [slug, setSlug] = useState(shop.slug)
  const [reviewUrl, setReviewUrl] = useState(shop.googleReviewUrl ?? '')
  const [ownerEditable, setOwnerEditable] = useState(shop.reviewLinkOwnerEditable)
  const [busy, setBusy] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const customerUrl = getCampaignUrl(shop.slug)
  const loginUrl = `${customerUrl}/admin`
  const reviewConfigured = Boolean(shop.googleReviewUrl)

  const slugIssue = (() => {
    const s = slug.trim()
    if (s === shop.slug) return null
    if (!s) return 'A slug is required.'
    if (s.length > 60) return 'Use 60 characters or fewer.'
    if (!SLUG_PATTERN.test(s)) return 'Use lowercase letters, numbers and hyphens only.'
    if (isReservedSlug(s)) return 'That address is reserved by the system. Choose another.'
    return null
  })()

  const reviewIssue = (() => {
    const t = reviewUrl.trim()
    if (!t) return null
    if (!/^https:\/\/\S+$/i.test(t)) return 'Enter a valid https:// URL.'
    try {
      new URL(t)
      return null
    } catch {
      return 'Enter a valid https:// URL.'
    }
  })()

  const run = async (key: string, action: () => Promise<void>, done: string) => {
    if (!client) return
    setBusy(key)
    onError(null)
    try {
      await action()
      await onChanged()
      onNotice(done)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  const saveBranding = () =>
    run(
      'branding',
      async () => {
        if (!client) return
        const amount = Number(minSpinAmount)
        if (!name.trim()) throw new Error('Shop name is required.')
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error('Minimum qualifying purchase must be ₹0 or more.')
        }
        await updateShopBranding(client, shop.id, {
          name: name.trim(),
          subtitle: subtitle.trim() || null,
          primaryColor: primaryColor.trim() || null,
          secondaryColor: secondaryColor.trim() || null,
          campaignBadge: campaignBadge.trim() || null,
          minSpinAmount: Math.round(amount),
        })
      },
      `Saved branding for ${shop.name}.`,
    )

  const saveSlug = () =>
    run(
      'slug',
      async () => {
        if (!client) return
        if (slugIssue) throw new Error(slugIssue)
        await renameStoreSlug(client, shop.id, slug.trim())
      },
      `Customer page is now ${getCampaignUrl(slug.trim())}. Reprint standees: printed QR codes still point at the old address.`,
    )

  const saveReviewLink = (value: string | null) =>
    run(
      'review',
      async () => {
        if (!client) return
        await saveStoreReviewLink(client, shop.id, value)
      },
      value ? `Review link saved for ${shop.name}.` : `Review link removed for ${shop.name}.`,
    )

  const saveOwnerPolicy = (editable: boolean) =>
    run(
      'review-policy',
      async () => {
        if (!client) return
        await setStoreReviewPolicy(client, shop.id, editable)
      },
      editable
        ? `The owner of ${shop.name} may now manage the review link.`
        : `The review link for ${shop.name} is platform-managed only.`,
    )

  const handleLogo = async (file: File) => {
    if (!client) return
    setLogoBusy(true)
    onError(null)
    try {
      await updateShopLogo(client, shop.id, file)
      await onChanged()
      onNotice(`Logo replaced for ${shop.name}.`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Logo upload failed.')
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Setup state: honest pending markers instead of fabricated details */}
      <div className="flex flex-wrap gap-2">
        {shop.ownerStatus !== 'linked' && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Setup pending · no owner account linked
          </span>
        )}
        {!reviewConfigured && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Setup pending · review link not configured
          </span>
        )}
        {shop.ownerStatus === 'linked' && reviewConfigured && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Configuration complete
          </span>
        )}
      </div>

      {/* Links */}
      <section className="rounded-lg border border-border-soft p-3">
        <h4 className="text-xs uppercase tracking-wide text-muted">Share links</h4>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Customer page</dt>
            <dd>
              <a
                href={customerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-brand underline"
              >
                {customerUrl}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Shop login</dt>
            <dd>
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-brand underline"
              >
                {loginUrl}
              </a>
            </dd>
          </div>
        </dl>
        <div className="mt-3">
          <QrDeliverable slug={shop.slug} />
        </div>
      </section>

      {/* Google Review Link panel */}
      <section className="rounded-lg border border-border-soft p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs uppercase tracking-wide text-muted">Google Review Link</h4>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              reviewConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {reviewConfigured ? 'Configured' : 'Not configured'}
          </span>
        </div>
        {reviewConfigured && (
          <p className="mt-2 text-sm">
            <span className="text-xs text-muted">Saved destination · </span>
            <a
              href={shop.googleReviewUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-mono text-xs text-brand underline"
            >
              {shop.googleReviewUrl}
            </a>{' '}
            <span className="text-xs text-muted">(open to verify)</span>
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <FormField
            label="Review URL"
            hint="https:// only. Reviews stay optional for customers — never tied to a prize."
          >
            <input
              className="field-input py-2"
              type="url"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              placeholder="https://search.google.com/local/writereview?placeid=…"
              aria-invalid={Boolean(reviewIssue)}
            />
          </FormField>
          {reviewIssue && (
            <p className="text-xs text-red-700" role="alert">
              {reviewIssue}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm"
              disabled={busy === 'review' || Boolean(reviewIssue) || reviewUrl.trim() === (shop.googleReviewUrl ?? '')}
              onClick={() => void saveReviewLink(reviewUrl.trim() || null)}
            >
              {busy === 'review' ? 'Saving…' : 'Save review link'}
            </button>
            {reviewConfigured && (
              <button
                type="button"
                className="rounded-lg border border-border-soft px-4 py-2 text-sm font-medium text-ink hover:bg-brand/5"
                disabled={busy === 'review'}
                onClick={() => {
                  setReviewUrl('')
                  void saveReviewLink(null)
                }}
              >
                Remove link
              </button>
            )}
          </div>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              className="accent-[var(--brand,#b03040)]"
              checked={ownerEditable}
              disabled={busy === 'review-policy'}
              onChange={(e) => {
                setOwnerEditable(e.target.checked)
                void saveOwnerPolicy(e.target.checked)
              }}
            />
            Allow the shop owner to manage this link from their dashboard (platform control stays
            authoritative)
          </label>
        </div>
      </section>

      {/* Branding + logo */}
      <section className="rounded-lg border border-border-soft p-3">
        <h4 className="text-xs uppercase tracking-wide text-muted">Branding</h4>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <img
            src={shop.logoUrl || '/logo-placeholder.svg'}
            alt={`Logo of ${shop.name}`}
            className="h-16 w-16 rounded-lg border border-border-soft bg-white object-contain p-1"
          />
          <div className="flex flex-col gap-1">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              id={`shop-logo-${shop.id}`}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleLogo(file)
              }}
            />
            <label
              htmlFor={`shop-logo-${shop.id}`}
              className="btn-secondary inline-flex cursor-pointer items-center justify-center px-4 py-2 text-sm"
            >
              {logoBusy ? 'Uploading…' : 'Replace logo'}
            </label>
            <p className="text-xs text-muted">JPG, PNG or WebP up to 5 MB.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="Shop name" id="shop-name">
            <input
              id="shop-name"
              className="field-input py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </FormField>
          <FormField label="Subtitle">
            <input
              className="field-input py-2"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </FormField>
          <FormField label="Primary color">
            <input
              type="color"
              aria-label="Primary color"
              className="h-11 w-24 cursor-pointer rounded-lg border border-border-soft bg-white p-1"
              value={primaryColor || '#b03040'}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </FormField>
          <FormField label="Secondary color">
            <input
              type="color"
              aria-label="Secondary color"
              className="h-11 w-24 cursor-pointer rounded-lg border border-border-soft bg-white p-1"
              value={secondaryColor || '#f2c94c'}
              onChange={(e) => setSecondaryColor(e.target.value)}
            />
          </FormField>
          <FormField label="Campaign badge">
            <input
              className="field-input py-2"
              value={campaignBadge}
              onChange={(e) => setCampaignBadge(e.target.value)}
            />
          </FormField>
          <FormField label="Minimum qualifying purchase (₹)">
            <input
              type="number"
              min={0}
              className="field-input py-2"
              value={minSpinAmount}
              onChange={(e) => setMinSpinAmount(e.target.value)}
            />
          </FormField>
        </div>
        <button
          type="button"
          className="btn-primary mt-3 px-4 py-2 text-sm"
          disabled={busy === 'branding'}
          onClick={() => void saveBranding()}
        >
          {busy === 'branding' ? 'Saving…' : 'Save branding'}
        </button>
      </section>

      {/* Slug */}
      <section className="rounded-lg border border-border-soft p-3">
        <h4 className="text-xs uppercase tracking-wide text-muted">Shop address (slug)</h4>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <FormField
              label="URL slug"
              hint="Changing this moves the customer page — printed QR codes keep the old address."
            >
              <input
                className="field-input font-mono py-2"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={60}
                aria-invalid={Boolean(slugIssue)}
              />
            </FormField>
          </div>
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm"
            disabled={busy === 'slug' || Boolean(slugIssue) || slug.trim() === shop.slug}
            onClick={() => void saveSlug()}
          >
            {busy === 'slug' ? 'Saving…' : 'Rename slug'}
          </button>
        </div>
        {slugIssue && (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {slugIssue}
          </p>
        )}
      </section>
    </div>
  )
}
