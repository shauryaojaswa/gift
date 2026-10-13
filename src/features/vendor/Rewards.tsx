import { useState } from 'react'
import { useAdminStore } from '@/features/admin/useAdminStore'
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

  const rewardName = (id: string) => rewards.find((r) => r.id === id)?.name ?? 'â€”'

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
      const id = rewardForm.id || `reward_${crypto.randomUUID().slice(0, 8)}`
      await dataProvider.upsertReward({ ...rewardForm, id })
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
      const id = tierForm.id || `tier_${crypto.randomUUID().slice(0, 8)}`
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
  const toggleTierActive = async (t: RewardTier) => {
    setBusy(true)
    try {
      await dataProvider.upsertTier({ ...t, active: !t.active })
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
  const deleteTier = async (t: RewardTier) => {
    if (!confirm(`Delete tier ${formatTierRange(t.minAmount, t.maxAmount)}?`)) return
    setBusy(true)
    try {
      await dataProvider.deleteTier(t.id)
      await reload()
      flash('Reward tier deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Rewards &amp; Tiers</h1>
        <p className="mt-1 text-sm text-muted">
          Manage the rewards customers win and the purchase ranges that unlock them. Changes apply to
          new customer sessions; past winners keep the reward they were originally awarded.
        </p>
      </header>
      {toast && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800" role="status">
          {toast}
        </p>
      )}

      {/* Rewards */}
      <section aria-labelledby="rewards-heading" className="rounded-xl border border-border-soft bg-paper">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
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
        <div className="divide-y divide-border-soft">
          {rewards.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No rewards yet. Add your first reward.</p>
          )}
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                {r.description && <p className="truncate text-xs text-muted">{r.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-border-soft text-muted'
                  }`}
                >
                  {r.active ? 'Active' : 'Off'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleRewardActive(r)}
                  disabled={busy}
                  className="rounded-md border border-border-soft px-2 py-1 text-xs text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-50"
                >
                  {r.active ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRewardErr(null)
                    setRewardForm(r)
                  }}
                  disabled={busy}
                  className="rounded-md border border-border-soft px-2 py-1 text-xs text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteReward(r)}
                  disabled={busy}
                  className="rounded-md border border-border-soft px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
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
                placeholder="e.g. â‚¹500 Voucher"
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
              {busy ? 'Savingâ€¦' : 'Save reward'}
            </button>
          </div>
        </Card>
      )}

      {/* Tiers */}
      <section aria-labelledby="tiers-heading" className="rounded-xl border border-border-soft bg-paper">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
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
          <p className="px-4 py-3 text-xs text-muted">Add a reward before creating purchase tiers.</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Range</th>
                <th className="px-4 py-2 font-medium">Reward</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tiers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                    No tiers yet.
                  </td>
                </tr>
              )}
              {tiers.map((t) => (
                <tr key={t.id} className="border-t border-border-soft">
                  <td className="px-4 py-2.5 text-ink">{formatTierRange(t.minAmount, t.maxAmount)}</td>
                  <td className="px-4 py-2.5 text-ink">{rewardName(t.rewardId)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.active ? 'bg-emerald-50 text-emerald-700' : 'bg-border-soft text-muted'
                      }`}
                    >
                      {t.active ? 'Active' : 'Off'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggleTierActive(t)}
                        disabled={busy}
                        className="rounded-md border border-border-soft px-2 py-1 text-xs text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-50"
                      >
                        {t.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTierErr(null)
                          setTierForm(t)
                        }}
                        disabled={busy}
                        className="rounded-md border border-border-soft px-2 py-1 text-xs text-muted hover:bg-brand/10 hover:text-ink disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTier(t)}
                        disabled={busy}
                        className="rounded-md border border-border-soft px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
              <FormField label="Minimum purchase (â‚¹)">
                <input
                  type="number"
                  inputMode="numeric"
                  className="field-input py-2.5 text-base"
                  value={tierForm.minAmount}
                  onChange={(e) => setTierForm({ ...tierForm, minAmount: Number(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="Maximum purchase (â‚¹)" hint="Leave blank for no upper limit (top tier only).">
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
                value={tierForm.rewardId}
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
              {busy ? 'Savingâ€¦' : 'Save tier'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
