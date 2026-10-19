import { useState } from 'react'
import type { DataProvider } from '@/lib/data/types'
import type { StoreConfig } from '@/types'
import {
  GIFT_COLUMN_COUNT,
  configuredGiftCount,
  missingGiftFields,
  normalizeGiftDraft,
  trimGiftDraft,
  validateGiftName,
} from '@/lib/gift-columns'

/**
 * The eight owner-editable gift fields - one per wheel segment.
 *
 * Rules enforced here (and again by the backend RPC):
 *   - fields start blank; nothing is invented or prepopulated;
 *   - partial drafts save with "N of 8 gifts configured" and the missing
 *     field numbers;
 *   - publishing is blocked until all 8 fields hold a real name - a partial
 *     draft is never published to the live wheel (the last published set stays
 *     live instead);
 *   - publishing replaces the live wheel atomically.
 */
export function GiftColumnsPanel({
  store,
  dataProvider,
  reload,
}: {
  store: StoreConfig
  dataProvider: DataProvider
  reload: () => void
}) {
  const published = store.giftColumns?.published ?? null
  const publishedAt = store.giftColumns?.publishedAt ?? null

  const [draft, setDraft] = useState<string[]>(() =>
    normalizeGiftDraft(store.giftColumns?.draft),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const configured = configuredGiftCount(draft)
  const missing = missingGiftFields(draft)
  const nameError = draft.map(validateGiftName).find((err) => err !== null) ?? null
  const canPublish = missing.length === 0 && nameError === null

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4000)
  }

  const setField = (index: number, value: string) => {
    setDraft((current) => current.map((field, i) => (i === index ? value : field)))
  }

  const saveDraft = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved = await dataProvider.saveGiftColumns(trimGiftDraft(normalizeGiftDraft(draft)), false)
      setDraft(saved.draft)
      await reload()
      flash(`Draft saved — ${configuredGiftCount(saved.draft)} of ${GIFT_COLUMN_COUNT} gifts configured.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the draft')
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!canPublish) return
    if (
      !confirm(
        'Publish these 8 gifts to the live wheel? This replaces the current gifts in one step.',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await dataProvider.saveGiftColumns(trimGiftDraft(normalizeGiftDraft(draft)), true)
      setDraft(saved.draft)
      await reload()
      flash('Gifts published — the customer wheel now shows exactly these 8 gifts.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish the gifts')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="gift-fields-heading" className="flex flex-col gap-4">
      <header>
        <h2 id="gift-fields-heading" className="font-display text-base font-semibold text-ink">
          Gift fields
        </h2>
        <p className="mt-1 text-sm text-muted">
          Eight gifts, one per wheel segment — field 1 is segment 1, field 2 is segment 2, and so on.
          Customers see these names exactly as you type them.
        </p>
      </header>

      {toast && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800" role="status">
          {toast}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {draft.map((value, index) => (
          <label key={index} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Gift {index + 1} (segment {index + 1})
            </span>
            <input
              type="text"
              className="field-input py-2.5 text-base"
              value={value}
              maxLength={64}
              placeholder="Enter gift name"
              onChange={(e) => setField(index, e.target.value)}
              aria-label={`Gift ${index + 1} name`}
            />
          </label>
        ))}
      </div>

      <p className="text-sm text-ink" role="status">
        {configured} of {GIFT_COLUMN_COUNT} gifts configured
        {missing.length > 0 && (
          <span className="text-muted">
            {' '}
            — still needed: {missing.map((n) => `gift ${n}`).join(', ')}
          </span>
        )}
      </p>

      <p className="text-xs text-muted">
        {published ? (
          <>
            Live wheel: 8 gifts published{publishedAt ? ` on ${new Date(publishedAt).toLocaleString('en-IN')}` : ''}.
            Saving a draft does not change the live wheel; publishing replaces it in one step.
          </>
        ) : (
          'Not published yet — customers currently see “REWARDS ARE BEING SET UP” until all 8 gifts are published.'
        )}
      </p>

      {nameError && (
        <p role="alert" className="max-w-sm text-sm text-red-700">
          {nameError}
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-sm text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveDraft}
          disabled={busy}
          className="btn-ghost rounded-xl px-4 py-2.5 text-sm"
        >
          {busy ? 'Saving…' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={busy || !canPublish}
          className="btn-primary rounded-xl px-4 py-2.5 text-sm"
          title={canPublish ? undefined : 'All 8 gifts must be filled before publishing.'}
        >
          {busy ? 'Working…' : 'Publish gifts'}
        </button>
      </div>
      {!canPublish && (
        <p className="text-xs text-muted">
          Publishing is blocked until all 8 fields are filled — empty or blank fields can never
          appear as prizes.
        </p>
      )}
    </section>
  )
}
