import { useMemo, useState } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { FormField } from '@/components/ui/FormField'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import { validateName, validatePhone, validatePurchaseAmount } from '@/lib/validation'

const QUICK_AMOUNTS: Array<{ label: string; value: number }> = [
  { label: '₹10K', value: 10000 },
  { label: '₹25K', value: 25000 },
  { label: '₹50K', value: 50000 },
  { label: '₹1L', value: 100000 },
  { label: '₹1.5L', value: 150000 },
]

export function DetailsScreen() {
  const store = useStoreConfigValue()
  const [touched, setTouched] = useState({ name: false, amount: false, phone: false })
  const {
    fullName,
    purchaseAmount,
    phoneNumber,
    setFullName,
    setPurchaseAmount,
    setPhoneNumber,
    setStep,
  } = useCustomerFlow((s) => ({
    fullName: s.fullName,
    purchaseAmount: s.purchaseAmount,
    phoneNumber: s.phoneNumber,
    setFullName: s.setFullName,
    setPurchaseAmount: s.setPurchaseAmount,
    setPhoneNumber: s.setPhoneNumber,
    setStep: s.setStep,
  }))

  const nameError = useMemo(
    () => (touched.name ? validateName(fullName).error : null),
    [fullName, touched.name],
  )
  const amountRaw = purchaseAmount === null ? '' : String(purchaseAmount)
  const amountValidationError = useMemo(
    () => validatePurchaseAmount(amountRaw, store.minSpinAmount).error,
    [amountRaw, store.minSpinAmount],
  )
  const amountError = touched.amount ? amountValidationError : null
  const phoneError = useMemo(
    () => (touched.phone ? validatePhone(phoneNumber).error : null),
    [phoneNumber, touched.phone],
  )

  const valid =
    validateName(fullName).valid &&
    purchaseAmount !== null &&
    purchaseAmount > 0 &&
    amountValidationError === null &&
    validatePhone(phoneNumber).valid

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) setStep('REVIEW_INVITATION')
      }}
      className="flex flex-col gap-4"
    >
      <div className="mb-1">
        <h1 className="font-display text-2xl font-bold text-ink">YOUR DETAILS</h1>
        <p className="mt-1 text-sm text-muted">Just three details to unlock your reward.</p>
      </div>

      <FormField label="FULL NAME" id="full-name" error={nameError}>
        <input
          id="full-name"
          type="text"
          className="field-input px-3 py-3 text-base"
          placeholder="Enter your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, name: true }))}
          autoComplete="name"
          autoFocus
          aria-label="Full name"
        />
      </FormField>

      <FormField
        label="PURCHASE AMOUNT"
        id="purchase-amount"
        error={amountError}
      >
        <CurrencyInput
          id="purchase-amount"
          value={purchaseAmount}
          onChange={setPurchaseAmount}
          placeholder={store.minSpinAmount > 0 ? `₹${store.minSpinAmount.toLocaleString('en-IN')}` : '₹10,000'}
          autoFocus={false}
          onBlur={() => setTouched((current) => ({ ...current, amount: true }))}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q.value}
              type="button"
              onClick={() => setPurchaseAmount(q.value)}
              className="tap-target rounded-full border border-border-soft bg-cream px-3 py-2 text-xs font-medium text-ink hover:border-brand hover:bg-brand/5 active:scale-95"
            >
              {q.label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="PHONE NUMBER" id="phone-number" error={phoneError}>
        <input
          id="phone-number"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          className="field-input px-3 py-3 text-base"
          placeholder="Enter 10-digit mobile number"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, phone: true }))}
          autoComplete="tel"
          maxLength={15}
          aria-label="10-digit mobile number"
        />
      </FormField>

      <button
        type="submit"
        className="btn-primary mt-5 rounded-xl border border-transparent px-3 py-3"
        disabled={!valid}
      >
        CONTINUE
      </button>
    </form>
  )
}
