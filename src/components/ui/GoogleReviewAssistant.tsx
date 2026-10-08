import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Gem,
  HandHelping,
  Heart,
  PenLine,
  PackageCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  UserRound,
  X,
} from 'lucide-react'
import { useStoreConfigValue } from '@/features/customer-flow/StoreContext'
import { configuredGoogleReviewUrl } from '@/lib/google-review'

const reviewOptions = [
  { text: 'Beautiful jewellery collection.', Icon: Gem },
  { text: 'Very helpful and friendly staff.', Icon: UserRound },
  { text: 'I really liked the jewellery designs.', Icon: Sparkles },
  { text: 'Good quality and good service.', Icon: HandHelping },
  { text: 'Very smooth shopping experience.', Icon: ShoppingBag },
  { text: 'The staff helped me choose the right jewellery.', Icon: UserRound },
  { text: 'I was happy with the overall experience.', Icon: Heart },
  { text: 'Good value for the quality.', Icon: Tag },
  { text: 'I found exactly what I was looking for.', Icon: PackageCheck },
  { text: 'Nice experience from start to finish.', Icon: Heart },
  { text: 'The collection had many beautiful options.', Icon: Gem },
  { text: 'My visit was a pleasant experience.', Icon: Sparkles },
]

type CopyState = 'idle' | 'copying' | 'copied' | 'failed'

interface GoogleReviewAssistantProps {
  className?: string
  onGoogleReturn?: () => void
}

interface PendingReviewReturn {
  armed: boolean
}

const REVIEW_RETURN_KEY = 'gift:review-return'

export function GoogleReviewAssistant({
  className = 'btn-primary',
  onGoogleReturn,
}: GoogleReviewAssistantProps) {
  const store = useStoreConfigValue()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const reviewTextRef = useRef<HTMLTextAreaElement>(null)
  const fallbackTextRef = useRef<HTMLTextAreaElement>(null)
  const onGoogleReturnRef = useRef(onGoogleReturn)
  const returnPendingRef = useRef(false)
  const returnArmedRef = useRef(false)
  const tabAwayRef = useRef(false)
  const returnHandledRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const reviewLink = useMemo(
    () => configuredGoogleReviewUrl(store.googleReviewUrl),
    [store.googleReviewUrl],
  )
  const selectedSentence = selectedOption === null ? null : reviewOptions[selectedOption].text
  const textIsCopied = Boolean(reviewText.trim()) && copiedText === reviewText
  const canOpenGoogle = Boolean(reviewLink.url)

  useEffect(() => {
    onGoogleReturnRef.current = onGoogleReturn
  }, [onGoogleReturn])

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

  const beginGoogleReturnFlow = () => {
    returnPendingRef.current = true
    returnArmedRef.current = false
    tabAwayRef.current = false
    returnHandledRef.current = false
    try {
      window.sessionStorage.setItem(
        `${REVIEW_RETURN_KEY}:${store.slug}`,
        JSON.stringify({ armed: false } satisfies PendingReviewReturn),
      )
    } catch {
      // Continue with in-memory return detection if session storage is unavailable.
    }
  }

  const armGoogleReturnFlow = () => {
    returnArmedRef.current = true
    try {
      window.sessionStorage.setItem(
        `${REVIEW_RETURN_KEY}:${store.slug}`,
        JSON.stringify({ armed: true } satisfies PendingReviewReturn),
      )
    } catch {
      // The active tab can still complete this flow without persistent storage.
    }
  }

  const cancelGoogleReturnFlow = () => {
    returnPendingRef.current = false
    returnArmedRef.current = false
    tabAwayRef.current = false
    try {
      window.sessionStorage.removeItem(`${REVIEW_RETURN_KEY}:${store.slug}`)
    } catch {
      // The return marker is best-effort only.
    }
  }

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
    setError(null)
    setPopupBlocked(false)
    setSuccessMessage(null)
  }

  const copyText = async (text: string): Promise<boolean> => {
    setCopyState('copying')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available')
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      setCopyState('copied')
      return true
    } catch {
      setCopiedText(null)
      setCopyState('failed')
      setSuccessMessage(null)
      return false
    }
  }

  const chooseOption = (index: number) => {
    const sentence = reviewOptions[index].text
    setSelectedOption(index)
    setReviewText(sentence)
    setCopiedText(null)
    setCopyState('idle')
    setError(null)
    setPopupBlocked(false)
    setSuccessMessage(null)
    void copyText(sentence)
  }

  const openGoogle = () => {
    if (!reviewLink.url) return false
    beginGoogleReturnFlow()
    try {
      const reviewTab = window.open(reviewLink.url, '_blank')
      if (reviewTab) {
        reviewTab.opener = null
        armGoogleReturnFlow()
        setPopupBlocked(false)
        setError(null)
        setSuccessMessage(
          copyState === 'copied' && textIsCopied
            ? 'Your review is copied. Paste it into Google and choose the rating that matches your experience.'
            : null,
        )
        return true
      }
    } catch {
      // Use the same visible recovery action for browser and popup API errors.
    }
    setPopupBlocked(true)
    setSuccessMessage(null)
    setError('Google could not be opened automatically.')
    return false
  }

  const copyAndOpenGoogle = () => {
    if (!reviewLink.url || !reviewText.trim()) {
      if (!reviewText.trim()) setError('Write a few words first, or choose a sentence above.')
      return
    }
    let reviewTab: Window | null = null
    beginGoogleReturnFlow()
    try {
      reviewTab = window.open('', '_blank')
      if (reviewTab) reviewTab.opener = null
    } catch {
      reviewTab = null
    }

    if (reviewTab) {
      armGoogleReturnFlow()
      setPopupBlocked(false)
      setError(null)
    } else {
      setPopupBlocked(true)
      setError('Google could not be opened automatically.')
    }

    void copyText(reviewText).then((copied) => {
      if (!reviewTab || !reviewLink.url) return
      try {
        reviewTab.location.replace(reviewLink.url)
        if (copied) {
          setSuccessMessage(
            'Your review is copied. Paste it into Google and choose the rating that matches your experience.',
          )
        }
      } catch {
        reviewTab.close()
        cancelGoogleReturnFlow()
        setPopupBlocked(true)
        setSuccessMessage(null)
        setError('Google could not be opened automatically.')
      }
    })
  }

  const copyAgain = () => {
    if (!reviewText.trim()) return
    setError(null)
    setPopupBlocked(false)
    setSuccessMessage(null)
    void copyText(reviewText)
  }

  const writeOwnReview = () => {
    setSelectedOption(null)
    setReviewText('')
    setCopiedText(null)
    setCopyState('idle')
    setError(null)
    setPopupBlocked(false)
    setSuccessMessage(null)
    reviewTextRef.current?.focus()
  }

  const openReadyButton = copyState === 'copied' && textIsCopied && selectedSentence === reviewText
  const primaryLabel = !canOpenGoogle
    ? 'Google link not set up'
    : !reviewText.trim()
      ? 'Choose a review'
      : openReadyButton
        ? 'Open Google →'
        : 'Copy & Open Google →'

  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={openAssistant}>
        ⭐ Leave a Google Review
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
              className="review-dialog flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[14px] bg-paper text-left sm:max-h-[92dvh] sm:rounded-[14px]"
              onKeyDown={(event) => {
                if (event.key !== 'Tab') return
                const focusable = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), textarea:not([disabled])',
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
              role="dialog"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-soft px-5 py-4 sm:px-6">
                <div>
                  <h2 id="google-review-heading" className="font-display text-2xl font-medium text-ink">
                    Share Your Experience
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Share details of your experience at this store in your own words.
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close review helper"
                  className="tap-target -mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream"
                  onClick={() => setIsOpen(false)}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </header>

              <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {reviewOptions.map(({ text, Icon }, index) => (
                    <button
                      key={text}
                      type="button"
                      aria-pressed={selectedOption === index}
                      onClick={() => chooseOption(index)}
                      className="review-suggestion tap-target flex min-h-[54px] items-center gap-3 border px-3 py-2.5 text-left text-sm leading-5 text-ink"
                    >
                      <Icon size={18} strokeWidth={1.7} className="shrink-0 text-brand" aria-hidden="true" />
                      <span className="flex-1">{text}</span>
                      {selectedOption === index && copyState === 'copied' && textIsCopied && (
                        <span className="shrink-0 text-xs font-medium text-brand">✓ Copied</span>
                      )}
                    </button>
                  ))}
                </div>

                <p className="mb-1 mt-5 text-sm font-medium text-ink">Want to add your own words?</p>
                <label htmlFor="review-text" className="sr-only">Your review text</label>
                <textarea
                  ref={reviewTextRef}
                  id="review-text"
                  className="field-input min-h-24 resize-y p-3 text-base leading-6"
                  placeholder="Write in your own words..."
                  value={reviewText}
                  onChange={(event) => {
                    setReviewText(event.target.value)
                    setCopiedText(null)
                    setCopyState('idle')
                    setError(null)
                    setPopupBlocked(false)
                  }}
                />
                <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
                  {Array.from(reviewText).length} characters
                </p>
                <button
                  type="button"
                  className="tap-target mt-2 inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-sm font-medium text-brand hover:bg-brand/5"
                  onClick={writeOwnReview}
                >
                  <PenLine size={17} aria-hidden="true" />
                  ✍ Write Your Own Review
                </button>

                {copyState === 'copied' && textIsCopied && (
                  <div className="review-message mt-2 p-3 text-sm text-brand" role="status">
                    <p className="font-medium">✓ Review copied</p>
                    <p className="mt-1">Ready to paste into Google</p>
                  </div>
                )}
                {selectedOption !== null && reviewText !== selectedSentence && copyState === 'idle' && (
                  <p className="review-message mt-2 p-3 text-sm font-medium text-ink" role="status">
                    Review edited
                  </p>
                )}
                {copyState === 'failed' && (
                  <div className="review-message mt-2 p-3">
                    <p className="text-sm font-medium">Copy this review, then paste it into Google.</p>
                    <label htmlFor="review-fallback-text" className="sr-only">Review text to copy</label>
                    <textarea
                      ref={fallbackTextRef}
                      id="review-fallback-text"
                      className="field-input mt-2 min-h-20 resize-y p-3 text-base leading-6"
                      value={reviewText}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <button type="button" className="btn-secondary tap-target mt-2 min-h-11" onClick={copyAgain}>
                      Copy Again
                    </button>
                    <button
                      type="button"
                      className="btn-ghost tap-target mt-2 min-h-11"
                      disabled={!canOpenGoogle}
                      onClick={openGoogle}
                    >
                      Open Google Review
                    </button>
                  </div>
                )}

                <p className="mt-3 text-sm text-muted">
                  Choose the rating that matches your experience.
                </p>
                {successMessage && (
                  <p className="review-message mt-3 p-3 text-sm" role="status">
                    {successMessage}
                  </p>
                )}
                {reviewLink.error && (
                  <p className="review-message mt-3 p-3 text-sm" role="alert">
                    {reviewLink.error}
                  </p>
                )}
                {popupBlocked && error && (
                  <div className="review-message mt-3 p-3" role="alert">
                    <p className="text-sm">{error}</p>
                    <button
                      type="button"
                      className="btn-secondary tap-target mt-2 min-h-11"
                      onClick={openGoogle}
                    >
                      Open Google Review
                    </button>
                  </div>
                )}
                {!popupBlocked && error && (
                  <p className="review-message mt-3 p-3 text-sm" role="alert">{error}</p>
                )}
              </div>

              <footer className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t border-border-soft bg-paper px-5 py-4 sm:px-6">
                <button
                  type="button"
                  className="btn-primary tap-target min-h-12"
                  disabled={!canOpenGoogle || !reviewText.trim() || copyState === 'copying'}
                  onClick={openReadyButton ? openGoogle : copyAndOpenGoogle}
                >
                  {primaryLabel}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
