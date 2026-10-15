import { useEffect, useState } from 'react'
import { useAdminStore } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import type { RewardTier } from '@/types'
import { formatINR } from '@/lib/currency'
import { validateTierConfiguration } from '@/lib/reward-engine'

export function TiersPage() {
  const { store, loading, dataProvider, reload } = useAdminStore()
  const [draftTiers, setDraftTiers] = useState<RewardTier[]>([])
  const [draftDirty, setDraftDirty] = useState(false)
  const tiers = draftTiers
  const rewards = store?.rewards ?? []
  const [editing, setEditing] = useState<RewardTier | null>(null)
  const [form, setForm] = useState<RewardTier>({
    id: '',
    minAmount: 0,
    maxAmount: null,
    rewardId: '',
    targetSegment: 0,
    active: true,
  })
  const [publishing, setPublishing] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!draftDirty) setDraftTiers(store?.tiers ?? [])
  }, [store, draftDirty])

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load store config.</p>

  const nextSegment = () => {
    const sameRewardTier = tiers.find((tier) => tier.rewardId === rewards[0]?.id)
    if (sameRewardTier) return sameRewardTier.targetSegment
    const used = new Set<number>()
    for (const t of tiers) used.add(t.targetSegment)
    let i = 0
    while (used.has(i) && i < 8) i++
    return i < 8 ? i : 0
  }

  const startEdit = (t: RewardTier) => {
    setEditing(t)
    setForm(t)
    setShowForm(true)
    setValidationError(null)
  }
  const startNew = () => {
    setEditing(null)
    setForm({
      id: '',
      minAmount: store.minSpinAmount,
      maxAmount: null,
      rewardId: rewards[0]?.id ?? '',
      targetSegment: nextSegment(),
      active: true,
    })
    setShowForm(true)
    setValidationError(null)
  }
  const cancelForm = () => {
    setShowForm(false)
    setEditing(null)
    setValidationError(null)
  }

  const handleSave = () => {
    if (!Number.isInteger(form.minAmount) || form.minAmount <= 0 || !form.rewardId) {
      setValidationError('Enter a whole-rupee minimum and choose a gift.')
      return
    }
    if (form.maxAmount !== null && (!Number.isInteger(form.maxAmount) || form.maxAmount <= form.minAmount)) {
      setValidationError('The maximum must be a whole-rupee amount greater than the minimum.')
      return
    }
    if (!Number.isInteger(form.targetSegment) || form.targetSegment < 0 || form.targetSegment > 7) {
      setValidationError('Choose a wheel segment from 1 to 8.')
      return
    }
    const id = form.id || crypto.randomUUID()
    const candidate = tiers.filter((tier) => tier.id !== id).concat({ ...form, id })
    setDraftTiers(candidate)
    setDraftDirty(true)
    setMessage('Tier saved as a draft. Publish your changes when the full set is ready.')
    setValidationError(null)
    cancelForm()
  }

  const publish = async () => {
    const validation = validateTierConfiguration(tiers, store.minSpinAmount, rewards)
    if (validation) {
      setValidationError(validation)
      return
    }
    setPublishing(true)
    setValidationError(null)
    setMessage(null)
    try {
      await dataProvider.saveTierConfiguration(tiers)
      await reload()
      setDraftDirty(false)
      setMessage('Purchase tiers published. New customer entries will use this configuration.')
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Could not publish purchase tiers')
    } finally {
      setPublishing(false)
    }
  }

  const discardDraft = () => {
    setDraftTiers(store.tiers)
    setDraftDirty(false)
    setValidationError(null)
    setMessage('Unpublished tier changes were discarded.')
    cancelForm()
  }

  const rewardName = (id: string | null) =>
    id ? rewards.find((r) => r.id === id)?.name ?? '—' : 'Gift pool (selected per spin)'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">Purchase Tiers</h3>
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={startNew}>
          + Add tier
        </button>
      </div>

      {draftDirty && (
        <div className="flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">You have unpublished tier changes. They do not affect new entries yet.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-2 text-sm" disabled={publishing} onClick={discardDraft}>Discard</button>
            <button type="button" className="btn-primary px-3 py-2 text-sm" disabled={publishing} onClick={publish}>
              {publishing ? 'Publishing…' : 'Publish changes'}
            </button>
          </div>
        </div>
      )}

      {/* Tier list */}
      <div className="grid gap-2">
        {[...tiers]
          .sort((a, b) => a.minAmount - b.minAmount)
          .map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-paper px-4 py-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">
                  {formatINR(t.minAmount)} – {t.maxAmount === null ? 'and above' : `${formatINR(t.maxAmount - 1)}`}
                </p>
                <p className="text-xs text-muted">
                  {rewardName(t.rewardId)} · Wheel segment {t.targetSegment + 1}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {t.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-xs"
                  onClick={() => startEdit(t)}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Edit/Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) cancelForm() }}>
          <Card className="max-h-[90dvh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <h3 className="font-display text-sm font-bold text-ink">{editing ? 'Edit Tier' : 'New Tier'}</h3>
              <p className="text-xs text-muted">Active purchase ranges must cover every rupee amount from the minimum upward without gaps or overlaps.</p>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <FormField label="Minimum amount (₹)">
                <input
                  type="number"
                  className="field-input py-2"
                  value={form.minAmount}
                  min={store.minSpinAmount}
                  onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Maximum amount (₹) — leave blank for no cap">
                <input
                  type="number"
                  className="field-input py-2"
                  value={form.maxAmount ?? ''}
                  onChange={(e) => setForm({ ...form, maxAmount: e.target.value ? Number(e.target.value) : null })}
                />
              </FormField>
              <FormField label="Gift">
                <select className="field-input py-2" value={form.rewardId ?? ''} onChange={(e) => setForm({ ...form, rewardId: e.target.value })}>
                  {rewards.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Wheel segment (1–8)">
                <input
                  type="number"
                  className="field-input py-2"
                  min={1}
                  max={8}
                  value={form.targetSegment + 1}
                  onChange={(e) => setForm({ ...form, targetSegment: Number(e.target.value) - 1 })}
                />
              </FormField>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="text-brand focus:ring-brand" />
                <span className="text-sm text-ink">Active purchase tier</span>
              </label>
            </CardBody>
            <CardFooter>
              <div className="flex w-full flex-col gap-2">
                {validationError && <p role="alert" className="text-sm text-red-700">{validationError}</p>}
                {message && <p role="status" className="text-sm text-green-800">{message}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost flex-1" onClick={cancelForm}>Cancel</button>
                  <button type="button" className="btn-primary flex-1" disabled={publishing || form.minAmount <= 0 || !form.rewardId} onClick={handleSave}>
                    {editing ? 'Save Tier Draft' : 'Add Tier to Draft'}
                  </button>
                </div>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}
