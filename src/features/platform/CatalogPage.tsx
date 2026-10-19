import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/data'
import {
  createCatalogGift,
  listCatalog,
  updateCatalogGift,
  type CatalogGift,
  type CatalogGiftInput,
} from './api'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'

const EMPTY: CatalogGiftInput = {
  name: '',
  wheelLabel: '',
  description: null,
  imageUrl: null,
  voucherValue: null,
  valueMin: null,
  valueMax: null,
  excludedStoreIds: [],
  claimCodePrefix: null,
  validityText: null,
  active: true,
}

export default function CatalogPage() {
  const client = getSupabaseClient()
  const [gifts, setGifts] = useState<CatalogGift[] | null>(null)
  const [form, setForm] = useState<CatalogGiftInput>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!client) return
    try {
      setGifts(await listCatalog(client, true))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the catalogue.')
    }
  }, [client])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!client) {
    return (
      <p className="rounded-lg border border-border-soft bg-paper p-4 text-sm text-muted">
        Catalogue administration requires the persistent Supabase backend.
      </p>
    )
  }
  if (!gifts) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  const startEdit = (gift: CatalogGift) => {
    setEditingId(gift.id)
    setForm({
      name: gift.name,
      wheelLabel: gift.wheelLabel,
      description: gift.description,
      imageUrl: gift.imageUrl,
      voucherValue: gift.voucherValue,
      valueMin: gift.valueMin,
      valueMax: gift.valueMax,
      excludedStoreIds: gift.excludedStoreIds,
      claimCodePrefix: gift.claimCodePrefix,
      validityText: gift.validityText,
      active: gift.active,
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const payload: CatalogGiftInput = {
        ...form,
        name: form.name.trim(),
        wheelLabel: form.wheelLabel.trim().toUpperCase(),
        description: form.description?.trim() || null,
        imageUrl: form.imageUrl?.trim() || null,
        claimCodePrefix: form.claimCodePrefix?.trim().toUpperCase() || null,
        validityText: form.validityText?.trim() || null,
      }
      // Price policy: both bounds or neither; voucher value must sit inside.
      if ((payload.valueMin === null) !== (payload.valueMax === null)) {
        throw new Error('Set both price-policy bounds, or leave both empty for a fixed value.')
      }
      if (payload.valueMin !== null && payload.valueMax !== null) {
        if (payload.valueMin < 0 || payload.valueMax < payload.valueMin) {
          throw new Error('The price-policy minimum must be ₹0 or more and not exceed the maximum.')
        }
        if (
          payload.voucherValue !== null &&
          (payload.voucherValue < payload.valueMin || payload.voucherValue > payload.valueMax)
        ) {
          throw new Error('The voucher value must sit inside the price policy for this gift.')
        }
      }
      if (editingId) {
        await updateCatalogGift(client, editingId, payload)
        setNotice(`Updated ${payload.name}.`)
      } else {
        await createCatalogGift(client, payload)
        setNotice(`Added ${payload.name} to the catalogue.`)
      }
      setForm(EMPTY)
      setEditingId(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the gift.')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (gift: CatalogGift) => {
    setBusy(true)
    setError(null)
    try {
      await updateCatalogGift(client, gift.id, { active: !gift.active })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the gift.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Gift Catalogue</h1>
        <p className="text-sm text-muted">
          Central catalogue of gifts shops can offer. Deactivate instead of deleting — gifts
          referenced by past selections keep historical claims intact.
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

      <section className="rounded-xl border border-border-soft bg-paper p-5">
        <h2 className="font-display text-lg font-bold text-ink">
          {editingId ? 'Edit gift' : 'Add gift'}
        </h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <FormField label="Name" id="gift-name">
            <input
              id="gift-name"
              className="field-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={80}
              required
            />
          </FormField>
          <FormField label="Wheel label (1–18 chars)" id="gift-wheel-label">
            <input
              id="gift-wheel-label"
              className="field-input font-mono uppercase"
              value={form.wheelLabel}
              onChange={(e) => setForm({ ...form, wheelLabel: e.target.value })}
              maxLength={18}
              required
            />
          </FormField>
          <FormField label="Description" id="gift-description">
            <input
              id="gift-description"
              className="field-input"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </FormField>
          <FormField label="Image URL" id="gift-image-url">
            <input
              id="gift-image-url"
              className="field-input"
              value={form.imageUrl ?? ''}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://…"
            />
          </FormField>
          <FormField
            label="Voucher value (₹, optional)"
            id="gift-voucher-value"
            hint="The catalogue's declared value. Shops see this as the default."
          >
            <input
              id="gift-voucher-value"
              type="number"
              className="field-input"
              value={form.voucherValue ?? ''}
              onChange={(e) =>
                setForm({ ...form, voucherValue: e.target.value === '' ? null : Number(e.target.value) })
              }
              min={0}
            />
          </FormField>
          <FormField
            label="Price policy min (₹, optional)"
            id="gift-value-min"
            hint="Lowest declared value a shop may set. Both bounds empty = fixed value."
          >
            <input
              id="gift-value-min"
              type="number"
              className="field-input"
              value={form.valueMin ?? ''}
              onChange={(e) =>
                setForm({ ...form, valueMin: e.target.value === '' ? null : Number(e.target.value) })
              }
              min={0}
            />
          </FormField>
          <FormField
            label="Price policy max (₹, optional)"
            id="gift-value-max"
            hint="Highest declared value a shop may set. Both bounds empty = fixed value."
          >
            <input
              id="gift-value-max"
              type="number"
              className="field-input"
              value={form.valueMax ?? ''}
              onChange={(e) =>
                setForm({ ...form, valueMax: e.target.value === '' ? null : Number(e.target.value) })
              }
              min={0}
            />
          </FormField>
          <FormField label="Claim code prefix (optional)" id="gift-claim-prefix">
            <input
              id="gift-claim-prefix"
              className="field-input font-mono uppercase"
              value={form.claimCodePrefix ?? ''}
              onChange={(e) => setForm({ ...form, claimCodePrefix: e.target.value })}
              maxLength={12}
            />
          </FormField>
          <FormField label="Validity text (optional)" id="gift-validity-text">
            <input
              id="gift-validity-text"
              className="field-input"
              value={form.validityText ?? ''}
              onChange={(e) => setForm({ ...form, validityText: e.target.value })}
              placeholder="Valid for 30 days"
            />
          </FormField>
          <div className="flex items-end gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add gift'}
            </button>
            {editingId && (
              <button
                type="button"
                className="rounded-lg border border-border-soft px-4 py-2 text-sm font-medium text-ink hover:bg-brand/5"
                onClick={() => {
                  setEditingId(null)
                  setForm(EMPTY)
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Catalogue entries</h2>
        {gifts.length === 0 ? (
          <p className="text-sm text-muted">No gifts yet — add the first one above.</p>
        ) : (
          gifts.map((gift) => (
            <article
              key={gift.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border border-border-soft bg-paper p-4 ${
                gift.active ? '' : 'opacity-70'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-ink">
                  {gift.name}
                  {!gift.active && <span className="ml-2 text-xs text-muted">(inactive)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {gift.wheelLabel}
                  </span>
                  {gift.voucherValue != null && <> · ₹{gift.voucherValue.toLocaleString('en-IN')}</>}
                  {gift.valueMin !== null && gift.valueMax !== null ? (
                    <>
                      {' '}
                      · shops may declare ₹{gift.valueMin.toLocaleString('en-IN')}–₹
                      {gift.valueMax.toLocaleString('en-IN')}
                    </>
                  ) : (
                    <> · fixed value</>
                  )}
                  {gift.excludedStoreIds.length > 0 && (
                    <> · not available to {gift.excludedStoreIds.length} shop(s)</>
                  )}
                  {gift.validityText && <> · {gift.validityText}</>}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand/5"
                onClick={() => startEdit(gift)}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand/5"
                disabled={busy}
                onClick={() => void toggleActive(gift)}
              >
                {gift.active ? 'Deactivate' : 'Activate'}
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  )
}
