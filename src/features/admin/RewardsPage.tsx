import { useState } from 'react'
import { useAdminStore } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import type { Reward } from '@/types'
import { TiersPage } from './TiersPage'

export function RewardsPage() {
  const { store, loading, dataProvider, reload } = useAdminStore()
  const rewards = store?.rewards ?? []
  const [editing, setEditing] = useState<Reward | null>(null)
  const [form, setForm] = useState<Reward>({
    id: '',
    name: '',
    shortLabel: '',
    description: '',
    voucherValue: null,
    claimCodePrefix: '',
    validityText: '',
    active: true,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load store config.</p>

  const startEdit = (r: Reward) => {
    setEditing(r)
    setForm({ ...r, shortLabel: r.shortLabel ?? r.name.slice(0, 18).toUpperCase() })
    setShowForm(true)
    setSaveError(null)
  }
  const startNew = () => {
    setEditing(null)
    setForm({ id: '', name: '', shortLabel: '', description: '', voucherValue: null, claimCodePrefix: '', validityText: '', active: true })
    setShowForm(true)
    setSaveError(null)
  }
  const cancelForm = () => {
    setShowForm(false)
    setEditing(null)
    setSaveError(null)
  }
  const handleSave = async () => {
    if (!form.name.trim() || !(form.shortLabel ?? '').trim()) {
      setSaveError('Name and short wheel label are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const id = form.id || crypto.randomUUID()
      await dataProvider.upsertReward({ ...form, id })
      await reload()
      cancelForm()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save gift')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (r: Reward) => {
    try {
      await dataProvider.upsertReward({ ...r, active: !r.active })
      await reload()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update gift')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Gifts &amp; Purchase Tiers</h2>
        <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={startNew}>
          + Add gift
        </button>
      </div>

      {/* Rewards list */}
      <div className="grid gap-3 sm:grid-cols-2">
        {rewards.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-xl border border-border-soft bg-paper p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-medium text-ink">{r.name}</h3>
                {r.description && <p className="mt-0.5 text-xs text-muted">{r.description}</p>}
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {r.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              {r.claimCodePrefix && <span className="rounded bg-border-soft px-1.5 py-0.5 font-mono">{r.claimCodePrefix}</span>}
              {r.validityText && <span>{r.validityText}</span>}
            </div>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                className="btn-ghost flex-1 px-3 py-2 text-xs"
                onClick={() => startEdit(r)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-ghost flex-1 px-3 py-2 text-xs"
                onClick={() => toggleActive(r)}
              >
                {r.active ? 'Deactivate' : 'Activate'}
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
              <h3 className="font-display text-sm font-bold text-ink">{editing ? `Edit: ${editing.name}` : 'New Gift'}</h3>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <FormField label="Gift name">
                <input className="field-input py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Premium Jewellery Care Kit" />
              </FormField>
              <FormField label="Short wheel label" hint="Shown on the spin wheel (max 18 chars)">
                <input
                  className="field-input py-2 uppercase"
                  maxLength={18}
                  placeholder="e.g. CARE KIT"
                  value={form.shortLabel ?? ''}
                  onChange={(e) => setForm({ ...form, shortLabel: e.target.value.toUpperCase() })}
                />
              </FormField>
              <FormField label="Description">
                <textarea className="field-input py-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of this gift" />
              </FormField>
              <FormField label="Voucher value (₹), if applicable">
                <input
                  className="field-input py-2"
                  type="number"
                  min={0}
                  value={form.voucherValue ?? ''}
                  onChange={(e) => setForm({ ...form, voucherValue: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 500"
                />
              </FormField>
              <FormField label="Claim code prefix">
                <input className="field-input py-2 uppercase" value={form.claimCodePrefix ?? ''} onChange={(e) => setForm({ ...form, claimCodePrefix: e.target.value.toUpperCase() })} placeholder="e.g. CARE" />
              </FormField>
              <FormField label="Validity text">
                <input className="field-input py-2" placeholder="e.g. Valid for 60 days" value={form.validityText ?? ''} onChange={(e) => setForm({ ...form, validityText: e.target.value })} />
              </FormField>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="text-brand focus:ring-brand" />
                <span className="text-sm text-ink">Active</span>
              </label>
            </CardBody>
            <CardFooter>
              <div className="flex w-full flex-col gap-2">
                {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost flex-1" onClick={cancelForm}>Cancel</button>
                  <button type="button" className="btn-primary flex-1" disabled={saving || !form.name.trim() || !(form.shortLabel ?? '').trim()} onClick={handleSave}>
                    {saving ? 'Saving…' : editing ? 'Save Gift' : 'Add Gift'}
                  </button>
                </div>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Tiers */}
      <TiersPage />
    </div>
  )
}
