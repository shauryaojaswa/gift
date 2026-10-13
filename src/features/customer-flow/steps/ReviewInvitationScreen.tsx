import { useEffect, useState } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { configuredGoogleReviewUrl } from '@/lib/google-review'
import { GoogleReviewAssistant } from '@/components/ui/GoogleReviewAssistant'

export function ReviewInvitationScreen() {
  const store = useStoreConfigValue()
  const setStep = useCustomerFlow((s) => s.setStep)
  const setReviewCtaShown = useCustomerFlow((s) => s.setReviewCtaShown)
  const setReviewCtaClicked = useCustomerFlow((s) => s.setReviewCtaClicked)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const reviewLink = configuredGoogleReviewUrl(store.googleReviewUrl)

  useEffect(() => setReviewCtaShown(true), [setReviewCtaShown])

  const handleContinue = () => setStep('SPIN')

  const handleOpenAssistant = () => {
    setReviewCtaClicked(true)
    setAssistantOpen(true)
  }

  const handleAssistantClose = () => {
    setAssistantOpen(false)
  }

  const handleAssistantSkip = () => {
    setAssistantOpen(false)
    setStep('SPIN')
  }

  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-display text-xl font-bold text-ink">ENJOYED YOUR EXPERIENCE?</h2>
      <p className="font-body text-balance text-sm text-muted max-w-sm">
        Share your genuine experience on Google. A review is optional and does not affect your reward.
      </p>

      {reviewLink.url ? (
        <button
          type="button"
          onClick={handleOpenAssistant}
          className="tap-target inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-brand px-6 py-3.5 text-base font-medium text-paper transition-colors hover:bg-brandHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Write a review
        </button>
      ) : (
        <button type="button" className="btn-primary" disabled title={reviewLink.error ?? undefined}>
          Write a review
        </button>
      )}

      <button type="button" className="btn-ghost mt-1 text-sm" onClick={handleContinue}>
        Skip &amp; Spin
      </button>

      <p className="font-body text-balance text-xs text-muted">
        Your reward is based only on your purchase amount and is never affected by a review.
      </p>

      <GoogleReviewAssistant
        open={assistantOpen}
        onClose={handleAssistantClose}
        onSkip={handleAssistantSkip}
        reviewUrl={reviewLink.url}
      />
    </div>
  )
}
