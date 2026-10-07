import { useState } from 'react'
import { useAdminStore } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import type { RewardTier } from '@/types'
import { formatINR } from '@/lib/currency'

export function TiersPage() {
  const { store, loading, dataProvider, reload } = useAdminStore()
  const tiers = store?.tiers ?? []
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
  const [saving, setSaving] = useState(false)

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load store config.</p>

  const nextSegment = () => {
    const used = new Set<number>()
    for (const t of tiers) used.add(t.targetSegment)
    let i = 0
    while (used.has(i)) i++
    return i
  }

  const startEdit = (t: RewardTier) => {
    setEditing(t)
    setForm(t)
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
  }

  const handleSave = async () => {
    if (form.minAmount <= 0 || !form.rewardId) return
    setSaving(true)
    try {
      const id = form.id || `tier_${crypto.randomUUID().slice(0, 8)}`
      await dataProvider.upsertTier({ ...form, id })
      await reload()
      startNew()
    } finally {
      setSaving(false)
    }
  }
  const handleDelete = async (t: RewardTier) => {
    if (!confirm(`Delete tier ${t.minAmount} - ${t.maxAmount ?? 'inf'}?`)) return
    await dataProvider.deleteTier(t.id)
    await reload()
    if (editing?.id === t.id) startNew()
  }

  const rewardName = (id: string) => rewards.find((r) => r.id === id)?.name ?? '—'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Reward Tiers</h2>
        <button type="button" className="btn-ghost" onClick={startNew}>
          + Add Tier
        </button>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-display text-sm text-ink">{editing ? 'Edit Tier' : 'New Tier'}</h3>
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
          <FormField label="Maximum amount (₹) - leave blank for no cap">
            <input
              type="number"
              className="field-input py-2"
              value={form.maxAmount ?? ''}
              onChange={(e) => setForm({ ...form, maxAmount: e.target.value ? Number(e.target.value) : null })}
            />
          </FormField>
          <FormField label="Reward">
            <select className="field-input py-2" value={form.rewardId} onChange={(e) => setForm({ ...form, rewardId: e.target.value })}>
              {rewards.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Target segment (wheel slot 0-N)">
            <input
              type="number"
              className="field-input py-2"
              min={0}
              max={rewards.length - 1}
              value={form.targetSegment}
              onChange={(e) => setForm({ ...form, targetSegment: Number(e.target.value) })}
            />
          </FormField>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="text-brand focus:ring-brand" />
            <span className="text-sm text-ink">Active</span>
          </label>
        </CardBody>
        <CardFooter>
          <button type="button" className="btn-primary" disabled={saving || form.minAmount <= 0 || !form.rewardId} onClick={handleSave}>
            {saving ? 'Saving…' : editing ? 'Update Tier' : 'Create Tier'}
          </button>
        </CardFooter>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border-soft bg-paper">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft bg-ink/3">
              <th className="px-3 py-2 text-left">Range</th>
              <th className="px-3 py-2 text-left">Reward</th>
              <th className="px-3 py-2 text-left">Segment</th>
              <th className="px-3 py-2 text-left">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {[...tiers]
              .sort((a, b) => a.minAmount - b.minAmount)
              .map((t) => (
                <tr key={t.id} className="border-b border-border-soft">
                  <td className="px-3 py-2">
                    {formatINR(t.minAmount)} - {t.maxAmount === null ? '∞' : formatINR(t.maxAmount)}
                  </td>
                  <td className="px-3 py-2">{rewardName(t.rewardId)}</td>
                  <td className="px-3 py-2">{t.targetSegment}</td>
                  <td className="px-3 py-2">{t.active ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" className="btn-ghost" onClick={() => startEdit(t)}>
                        Edit
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => handleDelete(t)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
