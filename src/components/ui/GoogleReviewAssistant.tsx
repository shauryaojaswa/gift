import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStoreConfigValue } from '@/features/customer-flow/StoreContext'
import { configuredGoogleReviewUrl } from '@/lib/google-review'

interface GoogleReviewAssistantProps {
  className?: string
  onGoogleReturn?: () => void
  /** Accessible label for the trigger button. */
  label?: string
  /**
   * When true, the trigger opens Google's real review composer immediately
   * (single tap, per the customer-flow spec). If the link is missing/invalid or
   * the popup is blocked, the assistant dialog opens as the recovery path.
   */
  directOpen?: boolean
}

const REVIEW_RETURN_KEY = 'gift:review-return'

export function GoogleReviewAssistant({
  className = 'btn-primary',
  onGoogleReturn,
  label = '⭐ Leave a Google Review',
  directOpen = false,
}: GoogleReviewAssistantProps) {
  const store = useStoreConfigValue()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onGoogleReturnRef = useRef(onGoogleReturn)
  const returnPendingRef = useRef(false)
  const returnArmedRef = useRef(false)
  const tabAwayRef = useRef(false)
  const returnHandledRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const reviewLink = useMemo(
    () => configuredGoogleReviewUrl(store.googleReviewUrl),
    [store.googleReviewUrl],
  )
  const canOpenGoogle = Boolean(reviewLink.url)

  useEffect(() => {
    onGoogleReturnRef.current = onGoogleReturn
  }, [onGoogleReturn])

  // Detect when the customer leaves to open Google and later returns, so the
  // in-progress session stays usable. This never fabricates or submits a review.
  useEffect(() => {
    if (!onGoogleReturn) return
    const storageKey = `${REVIEW_RETURN_KEY}:${store.slug}`
    const markTabAway = () => {
      if (returnPendingRef.current) tabAwayRef.current = true
    }
    const handleReturn = () => {
      if (
        document.visibilityState === 'hidden' ||
        !returnPendingRef.current ||
        !returnArmedRef.current ||
        !tabAwayRef.current ||
        returnHandledRef.current
      ) {
        return
      }

      returnHandledRef.current = true
      returnPendingRef.current = false
      returnArmedRef.current = false
      tabAwayRef.current = false
      try {
        window.sessionStorage.removeItem(storageKey)
      } catch {
        // Keep the in-memory return flow available when session storage is blocked.
      }
      setIsOpen(false)
      onGoogleReturnRef.current?.()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markTabAway()
      else handleReturn()
    }

    window.addEventListener('blur', markTabAway)
    window.addEventListener('focus', handleReturn)
    window.addEventListener('pageshow', handleReturn)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', markTabAway)
      window.removeEventListener('focus', handleReturn)
      window.removeEventListener('pageshow', handleReturn)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [onGoogleReturn, store.slug])

  useEffect(() => {
    if (!isOpen) return
    const triggerButton = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      triggerButton?.focus()
    }
  }, [isOpen])

  const openAssistant = () => {
    setIsOpen(true)
    setPopupBlocked(false)
  }

  const cancel = () => setIsOpen(false)

  const openGoogle = (): boolean => {
    if (!reviewLink.url) return false
    returnPendingRef.current = true
    returnArmedRef.current = false
    tabAwayRef.current = false
    returnHandledRef.current = false
    try {
      window.sessionStorage.setItem(`${REVIEW_RETURN_KEY}:${store.slug}`, JSON.stringify({ armed: false }))
    } catch {
      // Continue with in-memory return detection if session storage is unavailable.
    }

    try {
      const reviewTab = window.open(reviewLink.url, '_blank')
      if (reviewTab) {
        reviewTab.opener = null
        returnArmedRef.current = true
        try {
          window.sessionStorage.setItem(
            `${REVIEW_RETURN_KEY}:${store.slug}`,
            JSON.stringify({ armed: true }),
          )
        } catch {
          // The active tab can still complete this flow without persistent storage.
        }
        setPopupBlocked(false)
        return true
      }
    } catch {
      // Fall through to the visible recovery action below.
    }
    setPopupBlocked(true)
    return false
  }

  const handleTrigger = () => {
    if (directOpen && openGoogle()) return
    // Recovery path: link not configured, invalid, or popup blocked.
    openAssistant()
  }
  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={handleTrigger}>
        {label}
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false)
            }}
          >
            <section
              aria-labelledby="google-review-heading"
              aria-modal="true"
              role="dialog"
              className="review-dialog flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[14px] bg-paper text-left sm:rounded-[14px]"
              onKeyDown={(event) => {
                if (event.key !== 'Tab') return
                const focusable = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href]',
                  ),
                )
                const first = focusable[0]
                const last = focusable[focusable.length - 1]
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault()
                  last?.focus()
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault()
                  first?.focus()
                }
              }}
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-soft px-5 py-4 sm:px-6">
                <div>
                  <h2 id="google-review-heading" className="font-display text-2xl font-medium text-ink">
                    Share Your Experience
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Your honest review on Google helps other customers. Reviews are entirely optional.
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close review helper"
                  className="tap-target -mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream"
                  onClick={cancel}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </header>

              <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
                {reviewLink.error && (
                  <p className="review-message p-3 text-sm text-brand" role="alert">
                    {reviewLink.error}
                  </p>
                )}

                {!reviewLink.error && (
                  <p className="text-sm leading-6 text-ink">
                    Select <strong>Leave a Google Review</strong> to open Google&apos;s official review page in a
                    new tab, where you can write and submit your review directly.
                  </p>
                )}

                <p className="mt-3 text-xs leading-5 text-muted">
                  We never write, suggest, or submit a review for you. We do not see or store your review text,
                  rating, or Google sign-in details.
                </p>

                {popupBlocked && (
                  <div className="review-message mt-3 p-3" role="alert">
                    <p className="text-sm">Google could not be opened automatically.</p>
                    <button type="button" className="btn-secondary tap-target mt-2 min-h-11" onClick={openGoogle}>
                      Open Google Review
                    </button>
                  </div>
                )}
              </div>

              <footer className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t border-border-soft bg-paper px-5 py-4 sm:px-6">
                <button
                  type="button"
                  className="btn-primary tap-target w-full"
                  disabled={!canOpenGoogle}
                  onClick={openGoogle}
                >
                  {canOpenGoogle ? 'Leave a Google Review' : 'Google link not set up'}
                </button>
                <button type="button" className="btn-ghost tap-target w-full text-sm" onClick={cancel}>
                  Not now
                </button>
                <p className="text-center text-xs text-muted">
                  Your reward is already secured and is never affected by leaving a review.
                </p>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}

