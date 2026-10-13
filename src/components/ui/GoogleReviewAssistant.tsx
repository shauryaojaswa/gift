import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

const TOPICS = [
  'Service',
  'Collection',
  'Staff',
  'Quality',
  'Price',
  'Shopping Experience',
  'My Visit',
] as const

const SUGGESTIONS = [
  'Beautiful jewellery collection.',
  'Very helpful and friendly staff.',
  'I really liked the jewellery designs.',
  'Good quality and good service.',
  'Very smooth shopping experience.',
  'The staff helped me choose the right jewellery.',
  'I was happy with the overall experience.',
  'Good value for the quality.',
  'I found exactly what I was looking for.',
  'Nice experience from start to finish.',
]

type Step = 'suggestions' | 'confirm'

export function GoogleReviewAssistant({
  open,
  onClose,
  onSkip,
  reviewUrl,
}: {
  open: boolean
  onClose: () => void
  onSkip: () => void
  reviewUrl: string | null
}) {
  const [step, setStep] = useState<Step>('suggestions')
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setStep('suggestions')
      setSelectedTopic(null)
      setSelectedSuggestion(null)
      setCopied(false)
      setCopyError(null)
      document.body.style.overflow = 'hidden'
      setTimeout(() => closeRef.current?.focus(), 50)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleCopy = useCallback(async () => {
    if (!selectedSuggestion) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(selectedSuggestion)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyError('Could not copy automatically. Please select and copy the text manually.')
    }
  }, [selectedSuggestion])

  const handleOpenGoogle = useCallback(() => {
    if (reviewUrl) {
      window.open(reviewUrl, '_blank', 'noopener,noreferrer')
      onSkip()
    }
  }, [reviewUrl, onSkip])

  const handleBackToSuggestions = useCallback(() => {
    setStep('suggestions')
    setCopied(false)
    setCopyError(null)
  }, [])

  const handleSkipAndContinue = useCallback(() => {
    onSkip()
  }, [onSkip])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share Your Experience"
        className="review-dialog flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-paper sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Share Your Experience</h2>
            <p className="mt-0.5 text-sm text-muted">
              Share details of your experience at this store in your own words.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-border-soft hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {step === 'suggestions' ? (
            <div className="flex flex-col gap-4">
              {/* Topic chips */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Optional: choose a topic
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      aria-pressed={selectedTopic === topic}
                      onClick={() => setSelectedTopic(selectedTopic === topic ? null : topic)}
                      className={cn(
                        'tap-target rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        selectedTopic === topic
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border-soft bg-cream text-ink hover:border-brand/40',
                      )}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggestions */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Tap a suggestion to use it
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      aria-pressed={selectedSuggestion === suggestion}
                      onClick={() => setSelectedSuggestion(suggestion)}
                      className={cn(
                        'review-suggestion tap-target rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                        selectedSuggestion === suggestion
                          ? 'border-brand bg-brand/5 shadow-[inset_0_0_0_1px_var(--house-burgundy)]'
                          : 'border-border-soft bg-paper hover:border-gold hover:bg-gold/5',
                      )}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Confirm step */
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-ink">Your review is ready!</h3>
                <p className="mt-1 text-sm text-muted">
                  Your review text has been copied. Open Google Reviews and paste it into the review
                  box. You can edit the text before submitting your review.
                </p>
              </div>

              {selectedSuggestion && (
                <div className="review-message rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-ink">
                  {selectedSuggestion}
                </div>
              )}

              {copied && (
                <p role="status" className="text-sm font-medium text-green-700">
                  Copied to clipboard
                </p>
              )}
              {copyError && (
                <p role="alert" className="text-sm text-red-600">
                  {copyError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-soft px-5 py-4 sm:px-6">
          {step === 'suggestions' ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedSuggestion}
                onClick={() => {
                  handleCopy()
                  setStep('confirm')
                }}
              >
                Choose a review
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={handleSkipAndContinue}
              >
                Skip &amp; continue
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={handleCopy}
                >
                  {copied ? 'Copied!' : 'Copy review text'}
                </button>
                {reviewUrl && (
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={handleOpenGoogle}
                  >
                    Open Google Reviews
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost flex-1 text-sm"
                  onClick={handleBackToSuggestions}
                >
                  Back to suggestions
                </button>
                <button
                  type="button"
                  className="btn-ghost flex-1 text-sm"
                  onClick={handleSkipAndContinue}
                >
                  Skip &amp; continue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
