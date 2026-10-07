import { useEffect } from 'react'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'

export function ReviewInvitationScreen() {
  const store = useStoreConfigValue()
  const {
    reviewCtaShown,
    setReviewCtaShown,
    setReviewCtaClicked,
    setStep,
  } = useCustomerFlow((s) => ({
    reviewCtaShown: s.reviewCtaShown,
    setReviewCtaShown: s.setReviewCtaShown,
    setReviewCtaClicked: s.setReviewCtaClicked,
    setStep: s.setStep,
  }))

  useEffect(() => {
    if (!reviewCtaShown) setReviewCtaShown(true)
  }, [reviewCtaShown, setReviewCtaShown])

  const handleContinue = () => setStep('SPIN')

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
        We'd love to hear about your experience. Tap below to share a genuine review on Google —
        this opens in a new tab and takes just a moment.
      </p>

      {store.googleReviewUrl ? (
        <a
          href={store.googleReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setReviewCtaClicked(true)}
          className="tap-target inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-medium text-paper transition-all duration-200 ease-out hover:bg-brandHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-95"
        >
          LEAVE A GOOGLE REVIEW
        </a>
      ) : (
        <p className="font-body text-xs text-muted">Review link not configured by this store.</p>
      )}

      <button type="button" className="btn-ghost mt-1 text-sm" onClick={handleContinue}>
        CONTINUE TO SPIN
      </button>

      <p className="font-body text-balance text-xs text-muted">
        Your reward is based only on your purchase amount and is never affected by a review.
      </p>
    </div>
  )
}