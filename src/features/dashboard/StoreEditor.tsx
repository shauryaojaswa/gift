import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { OwnerReward, OwnerStore, OwnerTier } from '@/types/saas'
import { Button, Field, Panel, Select, StatusPill, SuccessNotice, TextInput, Money, ErrorNotice } from '@/components/saas/ui'

const MAX_WHEEL_LABEL = 14

// --- rewards ----------------------------------------------------------------

function emptyReward(): OwnerReward {
  return {
    id: '', name: '', wheelLabel: '', description: '', voucherAmount: null,
    claimCodePrefix: '', validityText: '', terms: null, active: true, sortOrder: 99,
  }
}

export function RewardsSection({ store, onSaved, embedded = false }: { store: OwnerStore; onSaved: () => void; embedded?: boolean }) {
  const [editing, setEditing] = useState<OwnerReward | null>(null)
  const [form, setForm] = useState<OwnerReward>(emptyReward())
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const startEdit = (reward: OwnerReward) => {
    setEditing(reward)
    setForm({ ...reward })
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const startNew = () => {
    setEditing(null)
    setForm(emptyReward())
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const closeForm = () => {
    setEditing(null)
    setForm(emptyReward())
    setShowForm(false)
  }

  const labelTooLong = (form.wheelLabel ?? '').length > MAX_WHEEL_LABEL

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body = {
        name: form.name,
        wheelLabel: form.wheelLabel,
        description: form.description,
        voucherAmount: form.voucherAmount,
        claimCodePrefix: form.claimCodePrefix,
        validityText: form.validityText,
        terms: form.terms,
        active: form.active,
      }
      if (editing?.id) await api.updateReward(store.id, editing.id, body)
      else await api.createReward(store.id, body)
      closeForm()
      setSuccess('Your changes have been saved.')
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save this gift. Your edits are kept.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (reward: OwnerReward) => {
    setError(null)
    try {
      await api.updateReward(store.id, reward.id, { active: !reward.active })
      setSuccess(reward.active ? 'Gift disabled.' : 'Gift enabled.')
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update this gift.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!embedded && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Gifts</h2>
          <Button size="sm" variant="secondary" onClick={startNew}>
            + Add gift
          </Button>
        </div>
      )}

      {success && <SuccessNotice message={success} />}
      {error && <ErrorNotice message={error} />}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Wheel label</th>
                <th className="px-4 py-2 font-medium">Full reward</th>
                <th className="px-4 py-2 font-medium">Voucher</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {store.rewards.map((reward) => (
                <tr key={reward.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{reward.wheelLabel || reward.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {reward.name}
                    {reward.validityText && <span className="block text-xs text-slate-400">{reward.validityText}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{reward.voucherAmount ? <Money amount={reward.voucherAmount} /> : '—'}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={reward.active ? 'active' : 'cancelled'} label={reward.active ? 'Active' : 'Disabled'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(reward)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleToggleActive(reward)}>
                        {reward.active ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {showForm ? (
        (
          <Panel className="p-5">
            <h3 className="text-sm font-semibold text-slate-900">{editing ? `Edit ${editing.name}` : 'New gift'}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Gift name" hint="Shown on the reward reveal page.">
                <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Premium Silver Gift" />
              </Field>
              <Field label="Wheel label" error={labelTooLong ? `Keep it to ${MAX_WHEEL_LABEL} characters so it stays readable.` : null} hint="Short label shown inside the wheel sector.">
                <TextInput value={form.wheelLabel ?? ''} onChange={(e) => setForm({ ...form, wheelLabel: e.target.value })} placeholder="SILVER GIFT" />
              </Field>
              <Field label="Description">
                <TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="An elegant sterling silver keepsake." />
              </Field>
              <Field label="Voucher amount (₹)" hint="Leave blank for a physical gift.">
                <TextInput
                  inputMode="numeric"
                  value={form.voucherAmount ?? ''}
                  onChange={(e) => setForm({ ...form, voucherAmount: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
                  placeholder="2500"
                />
              </Field>
              <Field label="Claim code prefix">
                <TextInput value={form.claimCodePrefix ?? ''} onChange={(e) => setForm({ ...form, claimCodePrefix: e.target.value.toUpperCase() })} placeholder="SILV" />
              </Field>
              <Field label="Validity">
                <TextInput value={form.validityText ?? ''} onChange={(e) => setForm({ ...form, validityText: e.target.value })} placeholder="Valid for 90 days from issue" />
              </Field>
              <Field label="Terms (optional)">
                <TextInput value={form.terms ?? ''} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="One gift per customer." />
              </Field>
              <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={handleSave} disabled={saving || !form.name || labelTooLong}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            </div>
          </Panel>
        )
      ) : null}
    </div>
  )
}

// --- tiers ------------------------------------------------------------------

export function TiersSection({ store, onSaved, embedded = false }: { store: OwnerStore; onSaved: () => void; embedded?: boolean }) {
  const [tiers, setTiers] = useState<OwnerTier[]>(store.tiers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    setTiers(store.tiers)
  }, [store.tiers])

  const update = (index: number, patch: Partial<OwnerTier>) => {
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)))
    setSuccess(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    setWarnings([])
    try {
      const result = await api.saveTiers(store.id, tiers)
      setWarnings(result.warnings ?? [])
      setSuccess('Purchase tiers saved.')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        setWarnings(e.errors ?? [])
      } else {
        setError('Could not save your changes. Your edits are kept.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!embedded && <h2 className="text-sm font-semibold text-slate-900">Purchase tiers</h2>}
      <p className="text-sm text-slate-500">
        Each purchase amount maps to exactly one gift. Amounts are in Indian Rupees and maximums are exclusive
        (₹10,000–₹19,999 is entered as 10000 to 20000).
      </p>

      {success && <SuccessNotice message={success} />}
      {error && <ErrorNotice message={error} />}
      {warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">From (₹)</th>
                <th className="px-4 py-2 font-medium">To (₹, exclusive)</th>
                <th className="px-4 py-2 font-medium">Gift</th>
                <th className="px-4 py-2 font-medium">Wheel segment</th>
                <th className="px-4 py-2 font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tiers.map((tier, index) => (
                <tr key={tier.id ?? `new-${index}`}>
                  <td className="px-4 py-2">
                    <TextInput
                      className="w-28"
                      inputMode="numeric"
                      value={tier.minAmount}
                      onChange={(e) => update(index, { minAmount: Number(e.target.value.replace(/\D/g, '')) })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <TextInput
                      className="w-28"
                      inputMode="numeric"
                      placeholder="No limit"
                      value={tier.maxAmount ?? ''}
                      onChange={(e) => update(index, { maxAmount: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Select value={tier.rewardId} onChange={(e) => update(index, { rewardId: e.target.value })}>
                      {store.rewards.map((reward) => (
                        <option key={reward.id} value={reward.id}>
                          {reward.wheelLabel || reward.name}{reward.active ? '' : ' (disabled)'}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-2">
                    <Select value={tier.targetSegment} onChange={(e) => update(index, { targetSegment: Number(e.target.value) })}>
                      {Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>Segment {i + 1}</option>)}
                    </Select>
                  </td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={tier.active} onChange={(e) => update(index, { active: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save tiers'}</Button>
      </div>
      <p className="text-xs text-slate-500">
        Changing tiers affects new customers only. Rewards already given keep the gift they were assigned.
      </p>
    </div>
  )
}
