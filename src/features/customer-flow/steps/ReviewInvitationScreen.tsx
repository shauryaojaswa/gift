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
      <h2 className="font-display text-xl font-bold text-ink">SHARE YOUR EXPERIENCE</h2>
      <p className="font-body text-balance text-sm text-muted max-w-sm">
        If you want, share an honest review about your visit. A review is optional, and your reward is
        not affected.
      </p>

      {reviewLink.url ? (
        <button
          type="button"
          onClick={handleOpenAssistant}
          className="tap-target inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-brand px-6 py-3.5 text-base font-medium text-paper transition-colors hover:bg-brandHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          ⭐ Leave a Google Review
        </button>
      ) : (
        <button type="button" className="btn-primary" disabled title={reviewLink.error ?? undefined}>
          ⭐ Leave a Google Review
        </button>
      )}

      <button type="button" className="btn-ghost mt-1 text-sm" onClick={handleContinue}>
        CONTINUE TO SPIN
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
