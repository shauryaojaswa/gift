import { useState } from 'react'
import { useAdminStore } from './useAdminStore'
import { Spinner } from '@/components/ui/Spinner'
import { FormField } from '@/components/ui/FormField'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import type { Reward } from '@/types'

export function RewardsPage() {
  const { store, loading, dataProvider, reload } = useAdminStore()
  const rewards = store?.rewards ?? []
  const [editing, setEditing] = useState<Reward | null>(null)
  const [form, setForm] = useState<Reward>({
    id: '',
    name: '',
    description: '',
    claimCodePrefix: '',
    validityText: '',
    active: true,
  })
  const [saving, setSaving] = useState(false)

  if (loading) return <Spinner />
  if (!store) return <p className="text-muted">Unable to load store config.</p>

  const startEdit = (r: Reward) => {
    setEditing(r)
    setForm(r)
  }
  const startNew = () => {
    setEditing(null)
    setForm({ id: '', name: '', description: '', claimCodePrefix: '', validityText: '', active: true })
  }
  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const id = form.id || `reward_${crypto.randomUUID().slice(0, 8)}`
      await dataProvider.upsertReward({ ...form, id })
      await reload()
      startNew()
    } finally {
      setSaving(false)
    }
  }
  const handleDelete = async (r: Reward) => {
    if (!confirm(`Delete reward "${r.name}"?`)) return
    await dataProvider.deleteReward(r.id)
    await reload()
    if (editing?.id === r.id) startNew()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Rewards</h2>
        <button type="button" className="btn-ghost" onClick={startNew}>
          + Add Reward
        </button>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-display text-sm text-ink">{editing ? `Edit: ${editing.name}` : 'New Reward'}</h3>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <FormField label="Name">
            <input className="field-input py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <input className="field-input py-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <FormField label="Claim code prefix">
            <input className="field-input py-2 uppercase" value={form.claimCodePrefix ?? ''} onChange={(e) => setForm({ ...form, claimCodePrefix: e.target.value.toUpperCase() })} />
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
          <button type="button" className="btn-primary" disabled={saving || !form.name} onClick={handleSave}>
            {saving ? 'Saving…' : editing ? 'Update Reward' : 'Create Reward'}
          </button>
        </CardFooter>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border-soft bg-paper">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft bg-ink/3">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Prefix</th>
              <th className="px-3 py-2 text-left">Validity</th>
              <th className="px-3 py-2 text-left">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id} className="border-b border-border-soft">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.claimCodePrefix ?? '—'}</td>
                <td className="px-3 py-2 text-muted">{r.validityText ?? '—'}</td>
                <td className="px-3 py-2">{r.active ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost" onClick={() => startEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => handleDelete(r)}>
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
