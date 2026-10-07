import { useEffect, useMemo, useRef, useState } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { useDataProvider } from '@/providers/DataProviderContext'
import { Confetti, FadeUp } from '@/components/ui/Confetti'
import { PrimaryButton } from '@/components/ui/PrimaryButton'

export function RewardScreen() {
  const store = useStoreConfigValue()
  const dataProvider = useDataProvider()
  const submissionStarted = useRef(false)
  const [submissionError, setSubmissionError] = useState(false)
  const [submissionAttempt, setSubmissionAttempt] = useState(0)
  const {
    rewardResult,
    purchaseAmount,
    phoneNumber,
    fullName,
    reviewCtaShown,
    reviewCtaClicked,
    setSubmissionId,
    submissionId,
    setStep,
  } = useCustomerFlow((s) => ({
    rewardResult: s.rewardResult,
    purchaseAmount: s.purchaseAmount,
    phoneNumber: s.phoneNumber,
    fullName: s.fullName,
    reviewCtaShown: s.reviewCtaShown,
    reviewCtaClicked: s.reviewCtaClicked,
    setSubmissionId: s.setSubmissionId,
    submissionId: s.submissionId,
    setStep: s.setStep,
  }))

  useEffect(() => {
    if (!rewardResult) {
      setStep('SPIN')
      return
    }
    if (submissionId || submissionStarted.current) return

    submissionStarted.current = true
    const submit = async () => {
      try {
        const res = await dataProvider.createSubmission({
          storeId: store.id,
          storeName: store.name,
          customerName: fullName,
          customerPhone: phoneNumber,
          purchaseAmount: purchaseAmount ?? 0,
          reward: rewardResult.reward,
          tier: rewardResult.tier,
          reviewCtaShown,
          reviewCtaClicked,
        })
        setSubmissionId(res.id)
      } catch (error) {
        console.error('Failed to save customer reward submission', error)
        submissionStarted.current = false
        setSubmissionError(true)
      }
    }
    submit()
  }, [
    rewardResult,
    submissionId,
    dataProvider,
    store,
    fullName,
    phoneNumber,
    purchaseAmount,
    reviewCtaShown,
    reviewCtaClicked,
    setSubmissionId,
    submissionAttempt,
    setStep,
  ])

  const code = useMemo(() => {
    const reward = rewardResult?.reward
    if (!reward?.claimCodePrefix || !submissionId) return null
    return `${reward.claimCodePrefix}-${submissionId.slice(-6).toUpperCase()}`
  }, [rewardResult?.reward, submissionId])

  if (!rewardResult) {
    return null
  }

  const { reward } = rewardResult

  return (
    <div className="relative flex flex-col items-center text-center gap-5">
      <Confetti active count={24} />
      <FadeUp delay={0}>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-gold to-brand text-paper shadow-lg">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 2l2.2 4H18l-2 4-2.8-1.2L11 14l-2-1.2L6 10l-2-4h5.8L12 2z" fill="currentColor" />
            <path d="M5 18a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-brand text-[10px] leading-5 text-white">★</span>
        </div>
      </FadeUp>

      <FadeUp delay={120}>
        <h2 className="font-display text-3xl font-bold text-ink">YOU WON</h2>
      </FadeUp>

      <FadeUp delay={240}>
        <span className="font-display text-3xl font-bold uppercase text-brand">{reward.name}</span>
      </FadeUp>

      <FadeUp delay={320}>
        <p className="font-body text-balance text-sm text-muted max-w-sm">
          Congratulations! Your purchase has unlocked this special reward.
        </p>
      </FadeUp>

      {code && (
        <FadeUp delay={360}>
          <div className="rounded-lg bg-ink/5 px-4 py-2.5 text-center">
            <span className="block font-body text-xs text-muted">Claim Code</span>
            <code className="font-mono text-base font-bold text-ink">{code}</code>
          </div>
        </FadeUp>
      )}

      {reward.validityText && (
        <FadeUp delay={400}>
          <span className="font-body text-xs text-muted">Valid &middot; {reward.validityText}</span>
        </FadeUp>
      )}

      <FadeUp delay={420}>
        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-semibold text-ink">
          <span aria-hidden="true">✦</span>
          <span>Please collect your gift from the counter.</span>
          <span aria-hidden="true">✦</span>
        </div>
      </FadeUp>

      <FadeUp delay={440}>
        <PrimaryButton
          disabled={submissionError}
          onClick={() => setStep('THANK_YOU')}
        >
          CONTINUE
        </PrimaryButton>
      </FadeUp>

      {submissionError && (
        <div className="w-full" role="alert">
          <p className="mb-2 text-sm text-muted">
            We could not save your response. Please try again.
          </p>
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              setSubmissionError(false)
              setSubmissionAttempt((attempt) => attempt + 1)
            }}
          >
            TRY AGAIN
          </PrimaryButton>
        </div>
      )}

      <FadeUp delay={500}>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            store.googleReviewUrl &&
            window.open(store.googleReviewUrl, '_blank', 'noopener,noreferrer')
          }
        >
          {store.googleReviewUrl ? 'Leave a Google Review' : 'Reviews not configured'}
        </button>
      </FadeUp>
    </div>
  )
}
