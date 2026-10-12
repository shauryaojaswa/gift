import { useEffect, useRef, useState } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { api, ApiError } from '@/lib/api'
import { Confetti, FadeUp } from '@/components/ui/Confetti'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { GoogleReviewAssistant } from '@/components/ui/GoogleReviewAssistant'

export function RewardScreen() {
  const store = useStoreConfigValue()
  const submissionStarted = useRef(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submissionAttempt, setSubmissionAttempt] = useState(0)
  const {
    rewardResult,
    purchaseAmount,
    phoneNumber,
    fullName,
    reviewCtaClicked,
    setSubmissionId,
    setClaimCode,
    submissionId,
    claimCode,
    setStep,
  } = useCustomerFlow((s) => ({
    rewardResult: s.rewardResult,
    purchaseAmount: s.purchaseAmount,
    phoneNumber: s.phoneNumber,
    fullName: s.fullName,
    reviewCtaClicked: s.reviewCtaClicked,
    setSubmissionId: s.setSubmissionId,
    setClaimCode: s.setClaimCode,
    submissionId: s.submissionId,
    claimCode: s.claimCode,
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
        // The reward is resolved and snapshotted server-side from the purchase amount.
        const res = await api.createPublicSubmission(store.slug, {
          customerName: fullName,
          phone: phoneNumber,
          purchaseAmount: purchaseAmount ?? 0,
          reviewCtaShown: true,
          reviewCtaClicked,
        })
        setSubmissionId(res.submissionId)
        setClaimCode(res.claimCode)
      } catch (error) {
        console.error('Failed to save customer reward submission')
        submissionStarted.current = false
        setSubmissionError(error instanceof ApiError ? error.message : 'We could not save your response.')
      }
    }
    submit()
  }, [
    rewardResult,
    submissionId,
    store.slug,
    fullName,
    phoneNumber,
    purchaseAmount,
    reviewCtaClicked,
    setSubmissionId,
    setClaimCode,
    submissionAttempt,
    setStep,
  ])

  if (!rewardResult) {
    return null
  }

  const { reward } = rewardResult

  return (
    <div className="relative flex flex-col items-center text-center gap-5">
      <Confetti active count={24} />
      <FadeUp delay={0}>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand text-paper">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 2l2.2 4H18l-2 4-2.8-1.2L11 14l-2-1.2L6 10l-2-4h5.8L12 2z" fill="currentColor" />
            <path d="M5 18a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-brand text-[10px] leading-5 text-white">★</span>
        </div>
      </FadeUp>

      <FadeUp delay={120}>
        <h2 className="font-display text-3xl font-bold text-ink">YOUR GIFT IS READY</h2>
      </FadeUp>

      <FadeUp delay={240}>
        <span className="font-display text-3xl font-bold uppercase text-brand">{reward.name}</span>
      </FadeUp>

      <FadeUp delay={320}>
        <p className="font-body text-balance text-sm text-muted max-w-sm">{reward.description}</p>
      </FadeUp>

      {claimCode && (
        <FadeUp delay={360}>
          <div className="rounded-lg bg-ink/5 px-4 py-2.5 text-center">
            <span className="block font-body text-xs text-muted">Claim Code</span>
            <code className="font-mono text-base font-bold text-ink">{claimCode}</code>
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
        <PrimaryButton disabled={Boolean(submissionError)} onClick={() => setStep('THANK_YOU')}>
          CONTINUE
        </PrimaryButton>
      </FadeUp>

      {submissionError && (
        <div className="w-full" role="alert">
          <p className="mb-2 text-sm text-muted">{submissionError}</p>
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              setSubmissionError(null)
              setSubmissionAttempt((attempt) => attempt + 1)
            }}
          >
            TRY AGAIN
          </PrimaryButton>
        </div>
      )}

      <FadeUp delay={500}>
        <GoogleReviewAssistant className="btn-ghost tap-target min-h-11 text-sm" />
      </FadeUp>
    </div>
  )
}
