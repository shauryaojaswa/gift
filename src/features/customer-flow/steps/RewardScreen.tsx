import { useState } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { configuredGoogleReviewUrl } from '@/lib/google-review'
import { Confetti, FadeUp } from '@/components/ui/Confetti'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { GoogleReviewAssistant } from '@/components/ui/GoogleReviewAssistant'

export function RewardScreen() {
  const store = useStoreConfigValue()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const reviewUrl = configuredGoogleReviewUrl(store.googleReviewUrl).url
  const {
    rewardResult,
    claimCode,
    setStep,
  } = useCustomerFlow((s) => ({
    rewardResult: s.rewardResult,
    claimCode: s.claimCode,
    setStep: s.setStep,
  }))

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
        <PrimaryButton
          onClick={() => setStep('THANK_YOU')}
        >
          CONTINUE
        </PrimaryButton>
      </FadeUp>

      {reviewUrl && (
        <FadeUp delay={480}>
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="tap-target inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-medium text-brand hover:bg-brand/5"
          >
            ⭐ Leave a Google Review
          </button>
        </FadeUp>
      )}

      <GoogleReviewAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onSkip={() => setAssistantOpen(false)}
        reviewUrl={reviewUrl}
      />
    </div>
  )
}
