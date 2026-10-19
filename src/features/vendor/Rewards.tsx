import { useState } from 'react'
import { Trash2, Package } from 'lucide-react'
import { useAdminStore } from '@/features/admin/useAdminStore'
import { GiftPoolPanel } from '@/features/platform/GiftPoolPanel'
import { GiftColumnsPanel } from '@/features/vendor/GiftColumnsPanel'
import { Spinner } from '@/components/ui/Spinner'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'
import type { Reward, RewardTier } from '@/types'
import { validateRewardName, validateTierRanges, rewardTierRanges, formatTierRange } from './lib'

export default function Rewards() {
  const { store, loading, dataProvider, reload } = useAdminStore()
  const rewards = store?.rewards ?? []
  const tiers = store?.tiers ?? []

  const [rewardForm, setRewardForm] = useState<Reward | null>(null)
  const [rewardErr, setRewardErr] = useState<string | null>(null)
  const [tierForm, setTierForm] = useState<RewardTier | null>(null)
  const [tierErr, setTierErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load your rewards.</p>

  const rewardName = (id: string | null) =>
    id ? rewards.find((r) => r.id === id)?.name ?? '—' : 'Gift pool (selected per spin)'

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3500)
  }

  const newReward = () => {
    setRewardErr(null)
    setRewardForm({ id: '', name: '', description: '', claimCodePrefix: '', validityText: '', active: true })
  }
  const saveReward = async () => {
    if (!rewardForm) return
    const err = validateRewardName(rewardForm.name)
    if (err) {
      setRewardErr(err)
      return
    }
    setBusy(true)
    setRewardErr(null)
    try {
      // rewards.id is a uuid column (matching the platform RewardsPage editor);
      // the demo provider accepts any opaque string id.
      const id = rewardForm.id || crypto.randomUUID()
      // The owner panel exposes ONE gift-name field per wheel segment, so the
      // wheel label must follow the name it is saved under (upsertReward falls
      // back to the name when shortLabel is absent). A deliberately distinct
      // short label - set outside this panel - is preserved as-is.
      const prior = rewards.find((r) => r.id === id)
      const shortLabel =
        prior?.shortLabel && prior.shortLabel !== prior.name ? prior.shortLabel : undefined
      await dataProvider.upsertReward({ ...rewardForm, id, shortLabel })
      await reload()
      setRewardForm(null)
      flash('Reward saved. New customer sessions will use it.')
    } catch (e) {
      setRewardErr(e instanceof Error ? e.message : 'Failed to save reward')
    } finally {
      setBusy(false)
    }
  }

  const newTier = () => {
    setTierErr(null)
    const used = new Set(tiers.map((t) => t.targetSegment))
    let seg = 0
    while (used.has(seg)) seg++
    setTierForm({ id: '', minAmount: store.minSpinAmount, maxAmount: null, rewardId: rewards[0]?.id ?? '', targetSegment: seg, active: true })
  }
  const saveTier = async () => {
    if (!tierForm) return
    const proposed = tiers.some((t) => t.id === tierForm.id)
      ? tiers.map((t) => (t.id === tierForm.id ? tierForm : t))
      : [...tiers, tierForm]
    const rangeErr = validateTierRanges(rewardTierRanges(proposed))
    if (rangeErr) {
      setTierErr(rangeErr)
      return
    }
    setBusy(true)
    setTierErr(null)
    try {
      // reward_tiers.id is a uuid column (matching the platform TiersPage editor)
      const id = tierForm.id || crypto.randomUUID()
      await dataProvider.upsertTier({ ...tierForm, id })
      await reload()
      setTierForm(null)
      flash('Reward tier saved. New customer sessions will use it.')
    } catch (e) {
      setTierErr(e instanceof Error ? e.message : 'Failed to save tier')
    } finally {
      setBusy(false)
    }
  }

  const toggleRewardActive = async (r: Reward) => {
    setBusy(true)
    try {
      await dataProvider.upsertReward({ ...r, active: !r.active })
      await reload()
    } finally {
      setBusy(false)
    }
  }
  const deleteReward = async (r: Reward) => {
    if (!confirm(`Delete reward "${r.name}"? Past submissions keep the reward they were awarded.`)) return
    setBusy(true)
    try {
      await dataProvider.deleteReward(r.id)
      await reload()
      flash('Reward deleted. Past submissions are unchanged.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Campaign</h1>
        <p className="mt-1 text-sm text-muted">
          {store.giftColumns
            ? 'Manage the eight gifts customers can win. They map one-to-one onto the wheel segments; changes apply to new customer sessions, and past winners keep the reward they were originally awarded.'
            : 'Manage the rewards customers win and the purchase ranges that unlock them. Changes apply to new customer sessions; past winners keep the reward they were originally awarded.'}
        </p>
      </header>
      {toast && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800" role="status">
          {toast}
        </p>
      )}

      {/* Gift-columns shops: the eight editable fields are the single source of
          truth, so the rewards/tier/pool editors stay hidden for them. */}
      {store.giftColumns ? (
        <GiftColumnsPanel store={store} dataProvider={dataProvider} reload={reload} />
      ) : (
      <>
      {/* Rewards */}
      <section aria-labelledby="rewards-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="rewards-heading" className="font-display text-base font-semibold text-ink">
            Rewards
          </h2>
          <button
            type="button"
            onClick={newReward}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            Add reward
          </button>
        </div>

        {rewards.length === 0 ? (
          <div className="rounded-xl border border-border-soft bg-paper px-6 py-10 text-center">
            <Package size={32} className="mx-auto mb-3 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">No rewards yet. Add your first reward.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rewards.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border-soft bg-paper p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                    {r.description && <p className="mt-0.5 truncate text-xs text-muted">{r.description}</p>}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-border-soft text-muted'
                    }`}
                  >
                    {r.active ? 'Active' : 'Off'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRewardErr(null)
                      setRewardForm(r)
                    }}
                    disabled={busy}
                    className="btn-ghost flex-1 px-3 py-2 text-xs"
                  >
                    Edit
                  </button>
                  <div className="relative group">
                    <button
                      type="button"
                      disabled={busy}
                      className="btn-ghost flex items-center gap-1 px-3 py-2 text-xs"
                      aria-label={`More options for ${r.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                    <div className="invisible absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border-soft bg-paper py-1 shadow-lg group-focus-within:visible group-hover:visible">
                      <button
                        type="button"
                        onClick={() => toggleRewardActive(r)}
                        disabled={busy}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-brand/5"
                      >
                        <Package size={12} aria-hidden="true" />
                        {r.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReward(r)}
                        disabled={busy}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reward editor form */}
      {rewardForm && (
        <Card>
          <CardHeader>
            <h3 className="font-display text-lg font-semibold text-ink">
              {rewardForm.id ? 'Edit reward' : 'New reward'}
            </h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <FormField label="Reward name" error={rewardErr}>
              <input
                className="field-input py-2.5 text-base"
                value={rewardForm.name}
                onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                placeholder="e.g. ₹500 Voucher"
              />
            </FormField>
            <FormField label="Description">
              <textarea
                className="field-input py-2.5 text-base"
                rows={2}
                value={rewardForm.description}
                onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Claim code prefix" hint="Optional, e.g. V500">
                <input
                  className="field-input py-2.5 text-base"
                  value={rewardForm.claimCodePrefix ?? ''}
                  onChange={(e) => setRewardForm({ ...rewardForm, claimCodePrefix: e.target.value })}
                />
              </FormField>
              <FormField label="Validity text">
                <input
                  className="field-input py-2.5 text-base"
                  value={rewardForm.validityText ?? ''}
                  onChange={(e) => setRewardForm({ ...rewardForm, validityText: e.target.value })}
                />
              </FormField>
            </div>
          </CardBody>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <button
              type="button"
              onClick={() => setRewardForm(null)}
              className="rounded-lg border border-border-soft px-4 py-2 text-sm font-medium text-muted hover:bg-brand/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveReward}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save reward'}
            </button>
          </div>
        </Card>
      )}

      {/* Tiers */}
      <section aria-labelledby="tiers-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="tiers-heading" className="font-display text-base font-semibold text-ink">
            Purchase tiers
          </h2>
          <button
            type="button"
            onClick={newTier}
            disabled={busy || rewards.length === 0}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            Add tier
          </button>
        </div>
        {rewards.length === 0 && (
          <p className="rounded-lg border border-border-soft bg-paper px-4 py-3 text-xs text-muted">
            Add a reward before creating purchase tiers.
          </p>
        )}
        {tiers.length === 0 && rewards.length > 0 ? (
          <div className="rounded-xl border border-border-soft bg-paper px-6 py-10 text-center">
            <p className="text-sm text-muted">No tiers yet. Add your first purchase tier.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {[...tiers]
              .sort((a, b) => a.minAmount - b.minAmount)
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-paper px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{formatTierRange(t.minAmount, t.maxAmount)}</p>
                    <p className="text-xs text-muted">{rewardName(t.rewardId)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.active ? 'bg-emerald-50 text-emerald-700' : 'bg-border-soft text-muted'
                      }`}
                    >
                      {t.active ? 'Active' : 'Off'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTierErr(null)
                        setTierForm(t)
                      }}
                      disabled={busy}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Gift options per bracket (multi-gift pools) */}
      {store?.id && (
        <section aria-label="Gift options per purchase bracket" className="rounded-xl border border-border-soft bg-paper p-5">
          <GiftPoolPanel storeId={store.id} />
        </section>
      )}

      {/* Tier editor form */}
      {tierForm && (
        <Card>
          <CardHeader>
            <h3 className="font-display text-lg font-semibold text-ink">
              {tierForm.id ? 'Edit purchase tier' : 'New purchase tier'}
            </h3>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Minimum purchase (₹)">
                <input
                  type="number"
                  inputMode="numeric"
                  className="field-input py-2.5 text-base"
                  value={tierForm.minAmount}
                  onChange={(e) => setTierForm({ ...tierForm, minAmount: Number(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="Maximum purchase (₹)" hint="Leave blank for no upper limit (top tier only).">
                <input
                  type="number"
                  inputMode="numeric"
                  className="field-input py-2.5 text-base"
                  value={tierForm.maxAmount ?? ''}
                  onChange={(e) =>
                    setTierForm({ ...tierForm, maxAmount: e.target.value === '' ? null : Number(e.target.value) || 0 })
                  }
                />
              </FormField>
            </div>
            <FormField label="Reward">
              <select
                className="field-input py-2.5 text-base"
                value={tierForm.rewardId ?? ''}
                onChange={(e) => setTierForm({ ...tierForm, rewardId: e.target.value })}
              >
                {rewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FormField>
            {tierErr && (
              <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
                {tierErr}
              </p>
            )}
          </CardBody>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <button
              type="button"
              onClick={() => setTierForm(null)}
              className="rounded-lg border border-border-soft px-4 py-2 text-sm font-medium text-muted hover:bg-brand/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveTier}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save tier'}
            </button>
          </div>
        </Card>
      )}
      </>
      )}
    </div>
  )
}
