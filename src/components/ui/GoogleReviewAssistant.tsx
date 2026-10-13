import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* Inline SVG icons (no external icon dependency, matching ReviewInvitationScreen). */
type IconProps = { size?: number; className?: string }

function SvgBase({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const XIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </SvgBase>
)

const CopyIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </SvgBase>
)

const CheckCircleIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </SvgBase>
)

const AlertCircleIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </SvgBase>
)

const ArrowLeftIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </SvgBase>
)

const RotateCcwIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </SvgBase>
)

const ExternalLinkIcon = ({ size, className }: IconProps) => (
  <SvgBase size={size} className={className}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </SvgBase>
)
import { useStoreConfigValue } from '@/features/customer-flow/StoreContext'
import { configuredGoogleReviewUrl } from '@/lib/google-review'
import { cn } from '@/lib/utils'

interface GoogleReviewAssistantProps {
  className?: string
  label?: string
  onGoogleReturn?: () => void
}

const REVIEW_RETURN_KEY = 'gift:review-return'

const TOPIC_CHIPS = ['Service', 'Collection', 'Staff', 'Quality', 'Price', 'Shopping Experience', 'My Visit'] as const

const REVIEW_SUGGESTIONS = [
  { text: 'Beautiful jewellery collection.', topic: 'Collection' as const },
  { text: 'Very helpful and friendly staff.', topic: 'Staff' as const },
  { text: 'I really liked the jewellery designs.', topic: 'Collection' as const },
  { text: 'Good quality and good service.', topic: 'Service' as const },
  { text: 'Very smooth shopping experience.', topic: 'Shopping Experience' as const },
  { text: 'The staff helped me choose the right jewellery.', topic: 'Staff' as const },
  { text: 'I was happy with the overall experience.', topic: 'My Visit' as const },
  { text: 'Good value for the quality.', topic: 'Price' as const },
  { text: 'I found exactly what I was looking for.', topic: 'Collection' as const },
  { text: 'Nice experience from start to finish.', topic: 'My Visit' as const },
]

type CopyState = 'idle' | 'copying' | 'copied' | 'failed'
type ConfirmationStep = 'initial' | 'confirming' | 'done'

const TopicChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    className={cn(
      'rounded-full px-4 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
      active
        ? 'bg-brand text-paper'
        : 'bg-border-soft text-ink hover:bg-border-soft'
    )}
    onClick={onClick}
    aria-pressed={active}
  >
    {label}
  </button>
)
const SuggestionCard = ({ suggestion, selected, onSelect }: { suggestion: (typeof REVIEW_SUGGESTIONS)[number]; selected: boolean; onSelect: () => void }) => (
  <button
    type="button"
    className={cn(
      'flex flex-col gap-2 rounded-xl border p-4 text-left',
      selected ? 'border-brand bg-cream ring-2 ring-brand/30' : 'border-border-soft bg-cream/60'
    )}
    onClick={onSelect}
    aria-pressed={selected}
  >
    <span className={cn('font-body text-sm leading-5', selected && 'font-semibold text-brand')}>
      {suggestion.text}
    </span>
    {selected && (
      <span className="flex items-center gap-1 text-xs font-medium text-brand">
        <CheckCircleIcon size={12} aria-hidden="true" />
        Selected
      </span>
    )}
  </button>
);
export function GoogleReviewAssistant({
  className = 'btn-primary',
  label = '⭐ Leave a Google Review',
  onGoogleReturn,
}: GoogleReviewAssistantProps) {
  const store = useStoreConfigValue()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [reviewText, setReviewText] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [step, setStep] = useState<ConfirmationStep>('initial')

  const reviewLink = useMemo(
    () => configuredGoogleReviewUrl(store.googleReviewUrl),
    [store.googleReviewUrl]
  )
  const canOpenGoogle = Boolean(reviewLink.url)

  const selectedSuggestion = selectedIndex === null ? null : REVIEW_SUGGESTIONS[selectedIndex]
  const selectedText = selectedSuggestion?.text ?? null
  const isSelectedCopied = Boolean(reviewText) && copyState === 'copied'

  const openAssistant = () => {
    if (isOpen) return
    setIsOpen(true)
    setError(null)
    setSuccessMessage(null)
    setPopupBlocked(false)
  }

  const closeAssistant = () => {
    setIsOpen(false)
    setError(null)
    setSuccessMessage(null)
    setPopupBlocked(false)
    setStep('initial')
  }

  const chooseTopic = (topic: string) => {
    setSelectedTopic(topic)
    setSelectedIndex(null)
    setReviewText(null)
    setCopyState('idle')
    setError(null)
  }
  const copyText = async (text: string): Promise<boolean> => {
    setCopyState('copying')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available')
      await navigator.clipboard.writeText(text)
      setReviewText(text)
      setCopyState('copied')
      setSuccessMessage(null)
      setError(null)
      return true
    } catch {
      setReviewText(null)
      setCopyState('failed')
      setSuccessMessage(null)
      setError('Could not copy to clipboard. Please select the text manually and copy it yourself.')
      return false
    }
  }

  const chooseSuggestion = (index: number) => {
    if (step === 'confirming') return
    const suggestion = REVIEW_SUGGESTIONS[index]
    setSelectedTopic(suggestion.topic)
    setSelectedIndex(index)
    setReviewText(suggestion.text)
    setCopyState('idle')
    setError(null)
    setSuccessMessage(null)
    setStep('initial')
    void copyText(suggestion.text)
  }

  const handleChooseReview = () => {
    if (selectedIndex === null) {
      setError('Please choose one of the suggestions first.')
      return
    }
    returnPendingRef.current = true
    tabAwayRef.current = false
    void copyText(selectedText as string).then(() => {
      setStep('confirming')
    })
  }

  const copyAgain = () => {
    if (!selectedText) return
    setError(null)
    setSuccessMessage(null)
    setPopupBlocked(false)
    void copyText(selectedText)
  }

  const openGoogle = () => {
    if (!reviewLink.url) {
      setError(reviewLink.error ?? 'Google review link is not configured.')
      setPopupBlocked(false)
      setSuccessMessage(null)
      return
    }
    if (!selectedText) {
      setError('Please copy the review text first, then open Google Reviews.')
      setPopupBlocked(false)
      setSuccessMessage(null)
      return
    }
    try {
      const reviewTab = window.open(reviewLink.url, '_blank')
      if (reviewTab) {
        reviewTab.opener = null
        setPopupBlocked(false)
        setError(null)
        if (isSelectedCopied) {
          setSuccessMessage('Your review text is copied. Paste it into Google and choose the rating that matches your experience.')
        }
      } else {
        setPopupBlocked(true)
        setSuccessMessage(null)
      }
    } catch {
      setPopupBlocked(true)
      setSuccessMessage(null)
    }
  }

  const handleSkip = () => {
    closeAssistant()
    setSelectedIndex(null)
    setSelectedTopic(null)
    setReviewText(null)
    setCopyState('idle')
    setError(null)
  }
  const backToSuggestions = () => {
    returnPendingRef.current = false
    tabAwayRef.current = false
    setSelectedIndex(null)
    setSelectedTopic(null)
    setStep('initial')
    setError(null)
    setSuccessMessage(null)
    setPopupBlocked(false)
  }

  const onGoogleReturnRef = useRef(onGoogleReturn)
  const tabAwayRef = useRef(false)
  const returnPendingRef = useRef(false)
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
      if (document.visibilityState === 'hidden') return
      if (!returnPendingRef.current || !tabAwayRef.current) return
      returnPendingRef.current = false
      tabAwayRef.current = false
      try {
        window.sessionStorage.setItem(storageKey, String(Date.now()))
      } catch {
        /* session storage blocked */
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

  const handleTrigger = () => {
    openAssistant()
  }
  const portalTarget = typeof document !== 'undefined' ? document.getElementById('gift-root') ?? document.body : null

  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={handleTrigger}>
        {label}
      </button>

      {isOpen &&
        portalTarget &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
            <div
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[16px] bg-paper p-5 shadow-2xl sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="review-heading"
            >
              <header className="flex items-start justify-between gap-4 border-b border-border-soft pb-4 sm:pb-5">
                <div>
                  <h2 id="review-heading" className="font-display text-2xl font-bold text-ink">
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream"
                  onClick={closeAssistant}
                >
                  <XIcon size={20} aria-hidden="true" />
                </button>
              </header>

              <div className="min-h-0 overflow-y-auto px-1 py-5 sm:px-5 sm:py-6">
                {!canOpenGoogle && (
                  <p className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    <AlertCircleIcon size={16} aria-hidden="true" />
                    {reviewLink.error ?? 'Google review link is not configured.'}
                  </p>
                )}

                {error && (
                  <p className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    <AlertCircleIcon size={16} aria-hidden="true" />
                    {error}
                  </p>
                )}

                {successMessage && !error && (
                  <p className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
                    <CheckCircleIcon size={16} aria-hidden="true" />
                    {successMessage}
                  </p>
                )}

                {step === 'initial' && (
                  <>
                    <p className="mt-2 text-sm leading-6 text-ink">
                      Choose a topic to see relevant writing starters, then pick a suggestion you like.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {TOPIC_CHIPS.map((topic) => (
                        <TopicChip
                          key={topic}
                          label={topic}
                          active={selectedTopic === topic}
                          onClick={() => chooseTopic(topic)}
                        />
                      ))}
                    </div>

                    <div className="mt-5">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                        {selectedTopic ? `${selectedTopic} suggestions` : 'All suggestions'}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {REVIEW_SUGGESTIONS.filter(
                          (s) => !selectedTopic || s.topic === selectedTopic
                        ).map((suggestion) => {
                          const realIndex = REVIEW_SUGGESTIONS.indexOf(suggestion)
                          return (
                            <SuggestionCard
                              key={suggestion.text}
                              suggestion={suggestion}
                              selected={selectedIndex === realIndex}
                              onSelect={() => chooseSuggestion(realIndex)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
                {step === 'confirming' && (
                  <div className="mt-2">
                    <h3 className="font-display text-lg font-semibold text-ink">Your review is ready!</h3>
                    <p className="mt-1 text-sm text-muted">
                      Here is the text you chose. Copy it, then open Google Reviews to paste it there.
                    </p>
                    <div className="mt-4 rounded-xl border border-border-soft bg-cream/60 p-4">
                      <p className="font-body text-sm leading-6 text-ink">{selectedText}</p>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        className="btn-primary inline-flex items-center justify-center gap-2"
                        onClick={copyAgain}
                        disabled={copyState === 'copying'}
                      >
                        <CopyIcon size={16} aria-hidden="true" />
                        {copyState === 'copying' ? 'Copying…' : 'Copy again'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary inline-flex items-center justify-center gap-2"
                        onClick={openGoogle}
                        disabled={!canOpenGoogle}
                      >
                        <ExternalLinkIcon size={16} aria-hidden="true" />
                        Open Google Reviews
                      </button>
                    </div>
                    {popupBlocked && (
                      <p className="mt-3 text-sm text-muted">
                        We could not open Google Reviews automatically (popup blocked). Please allow popups or{' '}
                        <a
                          className="font-medium text-brand underline"
                          href={reviewLink.url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                        >
                          open Google Reviews manually
                        </a>
                        .
                      </p>
                    )}
                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brandHover"
                      onClick={backToSuggestions}
                    >
                      <ArrowLeftIcon size={16} aria-hidden="true" />
                      Back to suggestions
                    </button>
                  </div>
                )}
              </div>

              <footer className="flex flex-col gap-2 border-t border-border-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"
                  onClick={handleSkip}
                >
                  <RotateCcwIcon size={14} aria-hidden="true" />
                  Skip &amp; continue without a review
                </button>
                {step === 'initial' && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleChooseReview}
                    disabled={selectedIndex === null}
                  >
                    Choose a review
                  </button>
                )}
              </footer>
            </div>
          </div>,
          portalTarget
        )}
    </>
  )
}
