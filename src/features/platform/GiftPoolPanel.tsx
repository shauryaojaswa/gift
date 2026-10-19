import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/data'
import {
  fetchGiftSchemaSupport,
  fetchMaxGiftSelections,
  listCatalog,
  listTiersWithPools,
  saveGiftOptions,
  updateCatalogGift,
  type CatalogGift,
  type GiftSchemaSupport,
  type TierWithPool,
} from './api'
import { Spinner } from '@/components/ui/Spinner'

/**
 * Per-bracket gift selection (Option B pools). Catalogue gifts are the only
 * selectable options; every limit is enforced server-side in
 * `save_store_gift_options` (count per platform policy, per-shop availability,
 * price policy on declared values, quantity bounds) - this panel surfaces the
 * platform's rules and the server's verdicts, it is never the boundary.
 *
 * Value model (kept separate, per the brief): the customer's purchase amount
 * decides the bracket; the gift's value is its catalogue value unless the shop
 * declared another value inside the platform price policy for that gift type.
 */
export function GiftPoolPanel({
  storeId,
  canManageAvailability = false,
}: {
  storeId: string
  /** Platform view: may toggle whether this gift type is available to the shop. */
  canManageAvailability?: boolean
}) {
  const client = getSupabaseClient()
  const [tiers, setTiers] = useState<TierWithPool[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogGift[]>([])
  const [support, setSupport] = useState<GiftSchemaSupport | null>(null)
  const [maxSelections, setMaxSelections] = useState<number>(4)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [quantities, setQuantities] = useState<Record<string, Record<string, string>>>({})
  const [savingTier, setSavingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!client) return
    try {
      const [tierRows, gifts, maxSel, schema] = await Promise.all([
        listTiersWithPools(client, storeId),
        listCatalog(client, true),
        fetchMaxGiftSelections(client),
        fetchGiftSchemaSupport(client),
      ])
      setTiers(tierRows)
      setCatalog(gifts)
      setMaxSelections(maxSel)
      setSupport(schema)
      const initial: Record<string, string[]> = {}
      const initialValues: Record<string, Record<string, string>> = {}
      const initialQuantities: Record<string, Record<string, string>> = {}
      for (const t of tierRows) {
        initial[t.id] = t.pool
          .map((p) => p.catalogGiftId)
          .filter((id): id is string => Boolean(id))
        initialValues[t.id] = {}
        initialQuantities[t.id] = {}
        for (const p of t.pool) {
          if (!p.catalogGiftId) continue
          initialValues[t.id][p.catalogGiftId] =
            p.declaredValue === null ? '' : String(p.declaredValue)
          initialQuantities[t.id][p.catalogGiftId] = p.quantity === null ? '' : String(p.quantity)
        }
      }
      setSelected(initial)
      setValues(initialValues)
      setQuantities(initialQuantities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load gift options.')
    }
  }, [client, storeId])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!client) {
    return (
      <p className="rounded-lg border border-border-soft bg-paper p-4 text-sm text-muted">
        Gift selection requires the persistent Supabase backend.
      </p>
    )
  }
  if (!tiers) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  const toggle = (tierId: string, giftId: string) => {
    setNotice(null)
    const current = selected[tierId] ?? []
    if (current.includes(giftId)) {
      setSelected((prev) => ({
        ...prev,
        [tierId]: (prev[tierId] ?? []).filter((id) => id !== giftId),
      }))
      return
    }
    if (current.length >= maxSelections) {
      setNotice(`A bracket can offer at most ${maxSelections} gifts.`)
      return
    }
    setSelected((prev) => ({ ...prev, [tierId]: [...(prev[tierId] ?? []), giftId] }))
  }

  const setField = (
    bucket: Record<string, Record<string, string>>,
    setter: typeof setValues,
    tierId: string,
    giftId: string,
    raw: string,
  ) => {
    setter({ ...bucket, [tierId]: { ...(bucket[tierId] ?? {}), [giftId]: raw } })
  }

  const save = async (tier: TierWithPool) => {
    if (!client) return
    setSavingTier(tier.id)
    setError(null)
    setNotice(null)
    try {
      const ids = selected[tier.id] ?? []
      const declared: Record<string, number | null> = {}
      const qty: Record<string, number | null> = {}
      for (const id of ids) {
        const rawValue = (values[tier.id]?.[id] ?? '').trim()
        declared[id] = rawValue === '' ? null : Number(rawValue)
        const rawQty = (quantities[tier.id]?.[id] ?? '').trim()
        qty[id] = rawQty === '' ? null : Number(rawQty)
      }
      await saveGiftOptions(client, tier.id, ids, declared, qty)
      await reload()
      setNotice(`Saved gift options for ${formatRange(tier)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save gift options.')
    } finally {
      setSavingTier(null)
    }
  }

  const toggleAvailability = async (gift: CatalogGift) => {
    if (!client) return
    setError(null)
    try {
      const excluded = gift.excludedStoreIds.includes(storeId)
        ? gift.excludedStoreIds.filter((id) => id !== storeId)
        : [...gift.excludedStoreIds, storeId]
      await updateCatalogGift(client, gift.id, { excludedStoreIds: excluded })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update gift availability.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">Gift options per purchase bracket</h3>
          <p className="text-sm text-muted">
            Select up to {maxSelections} catalogue gifts per bracket. Customers receive one of the
            selected gifts with equal probability. Prices stay within the platform policy set for
            each gift type.
          </p>
        </div>
      </div>

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

      <div className="flex flex-col gap-3">
        {tiers.map((tier) => {
          const chosen = selected[tier.id] ?? []
          const remaining = Math.max(0, maxSelections - chosen.length)
          return (
            <div key={tier.id} className="rounded-xl border border-border-soft bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-bold text-ink">
                    {formatRange(tier)}
                    {!tier.active && <span className="ml-2 text-xs text-muted">(inactive)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {chosen.length === 0 && tier.rewardId
                      ? `Legacy single gift: ${tier.rewardName ?? 'configured gift'}`
                      : `${chosen.length} of ${maxSelections} gifts selected · ${remaining} more can be added`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary px-4 py-2 text-sm"
                  disabled={savingTier === tier.id}
                  onClick={() => void save(tier)}
                >
                  {savingTier === tier.id ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {catalog
                  .filter((g) => g.active || chosen.includes(g.id))
                  .map((gift) => {
                    const checked = chosen.includes(gift.id)
                    const excluded = gift.excludedStoreIds.includes(storeId)
                    const adjustable = gift.valueMin !== null && gift.valueMax !== null
                    const rawValue = values[tier.id]?.[gift.id] ?? ''
                    const rawQty = quantities[tier.id]?.[gift.id] ?? ''
                    const poolEntry = tier.pool.find((p) => p.catalogGiftId === gift.id)
                    return (
                      <div
                        key={gift.id}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          checked ? 'border-brand bg-brand/5 text-ink' : 'border-border-soft text-muted'
                        } ${!gift.active || excluded ? 'opacity-60' : ''}`}
                      >
                        <label className={`flex items-center gap-2.5 ${excluded ? '' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            className="accent-[var(--brand,#b03040)]"
                            checked={checked}
                            disabled={excluded && !canManageAvailability}
                            onChange={() => toggle(tier.id, gift.id)}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {gift.name}
                            {!gift.active && <span className="ml-1 text-xs">(inactive)</span>}
                            {excluded && (
                              <span className="ml-1 text-xs">not available for this shop</span>
                            )}
                          </span>
                          <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                            {gift.wheelLabel}
                          </span>
                        </label>

                        <p className="mt-1 text-[11px] text-muted">
                          {adjustable
                            ? `Value policy: ₹${gift.valueMin?.toLocaleString('en-IN')} – ₹${gift.valueMax?.toLocaleString('en-IN')}`
                            : gift.voucherValue !== null
                              ? `Value: ₹${gift.voucherValue.toLocaleString('en-IN')} (fixed by platform)`
                              : 'Value: not set'}
                          {poolEntry && poolEntry.quantityClaimed > 0 && (
                            <> · {poolEntry.quantityClaimed} issued</>
                          )}
                        </p>

                        {checked && !excluded && (
                          <div className="mt-2 flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wide text-muted">
                                {adjustable ? 'Declared value (₹)' : 'Value (fixed)'}
                              </span>
                              <input
                                type="number"
                                className="field-input w-28 py-1 text-xs"
                                min={gift.valueMin ?? 0}
                                max={gift.valueMax ?? undefined}
                                value={rawValue}
                                disabled={!adjustable}
                                placeholder={adjustable ? `${gift.valueMin}–${gift.valueMax}` : 'platform default'}
                                aria-label={`Declared value for ${gift.name} in ${formatRange(tier)}`}
                                onChange={(e) => setField(values, setValues, tier.id, gift.id, e.target.value)}
                              />
                            </label>
                            {support?.stock && (
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] uppercase tracking-wide text-muted">
                                  Quantity (optional)
                                </span>
                                <input
                                  type="number"
                                  className="field-input w-24 py-1 text-xs"
                                  min={1}
                                  max={100000}
                                  value={rawQty}
                                  placeholder="unlimited"
                                  aria-label={`Quantity for ${gift.name} in ${formatRange(tier)}`}
                                  onChange={(e) => setField(quantities, setQuantities, tier.id, gift.id, e.target.value)}
                                />
                              </label>
                            )}
                          </div>
                        )}

                        {canManageAvailability && support?.availability && (
                          <button
                            type="button"
                            className="mt-2 rounded border border-border-soft px-2 py-0.5 text-[10px] font-medium text-muted hover:bg-brand/5"
                            onClick={() => void toggleAvailability(gift)}
                          >
                            {excluded ? 'Allow for this shop' : 'Disallow for this shop'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                {catalog.length === 0 && (
                  <p className="text-sm text-muted">No catalogue gifts yet — add some in Gift Catalogue.</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatRange(tier: { minAmount: number; maxAmount: number | null }): string {
  const fmt = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  })
  return tier.maxAmount === null
    ? `${fmt.format(tier.minAmount)} and above`
    : `${fmt.format(tier.minAmount)} – ${fmt.format(tier.maxAmount)}`
}
