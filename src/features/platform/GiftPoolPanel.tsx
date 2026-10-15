import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/data'
import {
  listCatalog,
  listTiersWithPools,
  saveGiftOptions,
  type CatalogGift,
  type TierWithPool,
} from './api'
import { Spinner } from '@/components/ui/Spinner'

const MAX_SELECTIONS = 4

/**
 * Per-bracket gift selection (Option B pools). Catalogue gifts are the only
 * selectable options; the limit is enforced client-side for UX and again in
 * `save_store_gift_options` server-side. Saving replaces the bracket's pool.
 */
export function GiftPoolPanel({ storeId }: { storeId: string }) {
  const client = getSupabaseClient()
  const [tiers, setTiers] = useState<TierWithPool[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogGift[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [savingTier, setSavingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!client) return
    try {
      const [tierRows, gifts] = await Promise.all([
        listTiersWithPools(client, storeId),
        listCatalog(client, true),
      ])
      setTiers(tierRows)
      setCatalog(gifts)
      const initial: Record<string, string[]> = {}
      for (const t of tierRows) {
        initial[t.id] = t.pool
          .map((p) => p.catalogGiftId)
          .filter((id): id is string => Boolean(id))
      }
      setSelected(initial)
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
    if (current.length >= MAX_SELECTIONS) {
      setNotice(`A bracket can offer at most ${MAX_SELECTIONS} gifts.`)
      return
    }
    setSelected((prev) => ({ ...prev, [tierId]: [...(prev[tierId] ?? []), giftId] }))
  }

  const save = async (tier: TierWithPool) => {
    if (!client) return
    setSavingTier(tier.id)
    setError(null)
    setNotice(null)
    try {
      await saveGiftOptions(client, tier.id, selected[tier.id] ?? [])
      await reload()
      setNotice(`Saved gift options for ${formatRange(tier)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save gift options.')
    } finally {
      setSavingTier(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">Gift options per purchase bracket</h3>
          <p className="text-sm text-muted">
            Select up to {MAX_SELECTIONS} catalogue gifts per bracket. Customers receive one of the
            selected gifts with equal probability.
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
                      : `${chosen.length} of ${MAX_SELECTIONS} gifts selected`}
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
                    return (
                      <label
                        key={gift.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          checked ? 'border-brand bg-brand/5 text-ink' : 'border-border-soft text-muted'
                        } ${!gift.active ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="accent-[var(--brand,#b03040)]"
                          checked={checked}
                          onChange={() => toggle(tier.id, gift.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {gift.name}
                          {!gift.active && <span className="ml-1 text-xs">(inactive)</span>}
                        </span>
                        <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                          {gift.wheelLabel}
                        </span>
                      </label>
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
