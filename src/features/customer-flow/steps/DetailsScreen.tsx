import { useMemo, useState } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { useDataProvider } from '@/providers/DataProviderContext'
import { FormField } from '@/components/ui/FormField'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import { validateName, validatePhone, validatePurchaseAmount } from '@/lib/validation'
import { getAwardableOptions, getPurchaseTier } from '@/lib/reward-engine'
import { formatCompactINR, formatINR } from '@/lib/currency'

export function DetailsScreen() {
  const store = useStoreConfigValue()
  const dataProvider = useDataProvider()
  const [touched, setTouched] = useState({ name: false, amount: false, phone: false })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const {
    fullName,
    purchaseAmount,
    phoneNumber,
    submissionId,
    submissionRequestId,
    setFullName,
    setPurchaseAmount,
    setPhoneNumber,
    setRewardResult,
    setSubmissionId,
    setClaimCode,
    setStep,
  } = useCustomerFlow((s) => ({
    fullName: s.fullName,
    purchaseAmount: s.purchaseAmount,
    phoneNumber: s.phoneNumber,
    submissionId: s.submissionId,
    submissionRequestId: s.submissionRequestId,
    setFullName: s.setFullName,
    setPurchaseAmount: s.setPurchaseAmount,
    setPhoneNumber: s.setPhoneNumber,
    setRewardResult: s.setRewardResult,
    setSubmissionId: s.setSubmissionId,
    setClaimCode: s.setClaimCode,
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

  // Quick amounts come from the shop's real purchase brackets, so the chips can
  // never disagree with the configured tiers (rendered in Indian currency).
  const quickAmounts = useMemo(() => {
    const minimums = Array.from(
      new Set(store.tiers.filter((t) => t.active).map((t) => t.minAmount)),
    ).sort((a, b) => a - b)
    const step = Math.max(1, Math.ceil(minimums.length / 5))
    return minimums
      .filter((_, index) => index % step === 0)
      .slice(0, 5)
      .map((value) => ({ label: formatCompactINR(value), value }))
  }, [store.tiers])

  // Once the entry is saved the reward snapshot is immutable: the form locks
  // and CONTINUE only advances (a second claim can never be minted here).
  const claimed = submissionId !== null

  const submitForm = async () => {
    setTouched({ name: true, amount: true, phone: true })
    if (!validateName(fullName).valid) {
      document.getElementById('full-name')?.focus()
      return
    }
    if (amountValidationError) {
      document.getElementById('purchase-amount')?.focus()
      return
    }
    if (!validatePhone(phoneNumber).valid) {
      document.getElementById('phone-number')?.focus()
      return
    }
    if (purchaseAmount === null) return

    // A bracket with no awardable gift pool must never mint a claim: show the
    // designed "not configured" state instead of inventing a prize.
    const tier = getPurchaseTier(purchaseAmount, store)
    const options = tier ? getAwardableOptions(tier, store) : []
    if (tier && options.length === 0) {
      setUnavailable(true)
      return
    }

    if (claimed) {
      setStep('REVIEW_INVITATION')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const assignment = await dataProvider.createSubmission({
        storeSlug: store.slug,
        requestId: submissionRequestId,
        customerName: fullName,
        customerPhone: phoneNumber,
        purchaseAmount,
        reviewCtaShown: false,
        reviewCtaClicked: false,
      })
      setSubmissionId(assignment.id)
      setClaimCode(assignment.claimCode)
      setRewardResult({
        amount: purchaseAmount,
        reward: assignment.reward,
        tier: assignment.tier,
        targetSegment: assignment.tier.targetSegment,
      })
      setStep('REVIEW_INVITATION')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We could not save your entry. Please try again.'
      if (message.includes('No unique active reward is configured')) {
        setUnavailable(true)
      } else {
        setSubmitError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (unavailable) {
    return (
      <div className="flex flex-col gap-4 text-center" role="status">
        <h1 className="font-display text-2xl font-bold text-ink">REWARDS ARE BEING SET UP</h1>
        <p className="text-sm text-muted">
          {store.name} has not finished setting up the gifts for this purchase amount yet, so no
          reward can be issued right now. Please ask the store team to finish the setup — it only
          takes a few minutes — and then try again.
        </p>
        {purchaseAmount !== null && (
          <p className="font-display text-lg font-bold text-ink">{formatINR(purchaseAmount)}</p>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setUnavailable(false)
            setSubmitError(null)
            void submitForm()
          }}
        >
          CHECK AGAIN
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submitForm()
      }}
      className="flex flex-col gap-4"
    >
      <div className="mb-1">
        <h1 className="font-display text-2xl font-bold text-ink">YOUR DETAILS</h1>
        <p className="mt-1 text-sm text-muted">Just three details to unlock your reward.</p>
      </div>

      {claimed && (
        <p className="rounded-lg border border-border-soft bg-cream px-3 py-2 text-xs text-muted">
          Your entry is saved and your reward is waiting — the details below can no longer change.
        </p>
      )}

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
          disabled={claimed || submitting}
        />
      </FormField>

      <FormField label="PURCHASE AMOUNT" id="purchase-amount" error={amountError}>
        <CurrencyInput
          id="purchase-amount"
          value={purchaseAmount}
          onChange={setPurchaseAmount}
          placeholder={store.minSpinAmount > 0 ? formatINR(store.minSpinAmount) : formatINR(10000)}
          autoFocus={false}
          onBlur={() => setTouched((current) => ({ ...current, amount: true }))}
          disabled={claimed || submitting}
        />
        {quickAmounts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickAmounts.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => setPurchaseAmount(q.value)}
                className="tap-target rounded-full border border-border-soft bg-cream px-3 py-2 text-xs font-medium text-ink hover:border-brand hover:bg-brand/5 active:scale-95"
                aria-label={`Set purchase amount to ${formatINR(q.value)}`}
                disabled={claimed || submitting}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
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
          disabled={claimed || submitting}
        />
      </FormField>

      {submitError && (
        <p role="alert" className="max-w-sm text-sm text-red-700">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        className={`btn-primary mt-5 rounded-xl border border-transparent px-3 py-3 ${valid ? '' : 'opacity-80'}`}
        disabled={submitting}
      >
        {submitting ? 'SAVING YOUR ENTRY…' : 'CONTINUE'}
      </button>
    </form>
  )
}
