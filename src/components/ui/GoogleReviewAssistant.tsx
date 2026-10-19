import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { reviewSetFor, type ReviewTopic } from '@/lib/review-recommendations'

/** Inline SVG icons (the codebase convention — avoids lucide typing quirks). */
function IconGlyph({ kind }: { kind: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'shrink-0 text-brand',
  }
  switch (kind) {
    case 'gem':
      return (<svg {...common}><path d="M6 3h12l3 6-9 12L3 9z" /><path d="M3 9h18" /><path d="M9 3l3 6 3-6" /></svg>)
    case 'user':
      return (<svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>)
    case 'sparkle':
      return (<svg {...common}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></svg>)
    case 'badge':
      return (<svg {...common}><path d="M12 2l2.4 1.8 3-.2 1 2.8 2.4 1.8-1 2.9 1 2.9-2.4 1.8-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8L3.2 15.8l1-2.9-1-2.9 2.4-1.8 1-2.8 3 .2z" /><path d="M9 12l2 2 4-4" /></svg>)
    case 'bag':
      return (<svg {...common}><path d="M6 7h12l1.5 13H4.5z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></svg>)
    case 'hands':
      return (<svg {...common}><path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20z" /><path d="M12 20V9" /></svg>)
    case 'heart':
      return (<svg {...common}><path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20z" /></svg>)
    case 'tag':
      return (<svg {...common}><path d="M20.6 12.6L12 21.2 3.4 12.6V3.4h9.2z" /><circle cx="8" cy="8" r="1.4" /></svg>)
    case 'package':
      return (<svg {...common}><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>)
    case 'smile':
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>)
    default:
      return (<svg {...common}><circle cx="12" cy="12" r="9" /></svg>)
  }
}

/**
 * The review starters come from the shop's own business type (see
 * '@/lib/review-recommendations'): the approved jewellery sentences for
 * jewellers, clothing and ethnic-wear sentences for clothing shops.
 */
type Topic = ReviewTopic | 'All'

export function GoogleReviewAssistant({
  open,
  onClose,
  onSkip,
  onReviewed,
  reviewUrl,
  storeSlug,
}: {
  open: boolean
  onClose: () => void
  onSkip: () => void
  onReviewed?: () => void
  reviewUrl: string | null
  /** Which shop this is - selects its business-type review recommendations. */
  storeSlug: string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  // The shop's own recommendations (jewellery sentences for jewellers,
  // clothing sentences for clothing shops) - never a shared list.
  const reviewSet = reviewSetFor(storeSlug)
  const TOPICS: Topic[] = ['All', ...reviewSet.topics]
  const SUGGESTIONS = reviewSet.suggestions
  const [topic, setTopic] = useState<Topic>('All')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [opened, setOpened] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setSelected(null)
      setTopic('All')
      setCopied(false)
      setCopyError(null)
      setPopupBlocked(false)
      setOpened(false)
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

  /** Copy is confirmed only when the platform confirms it. */
  const copyText = useCallback(async (value: string): Promise<boolean> => {
    if (!value) return false
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      return true
    } catch {
      setCopyError('Could not copy automatically. Please select and copy the text manually.')
      return false
    }
  }, [])

  /**
   * Open the shop's Google review page in a new tab. Browsers implementing
   * "noopener" return null from window.open even when the tab opened, so
   * blocked-vs-open is detected with a short-lived probe window first. The
   * real call keeps "noopener,noreferrer". Google is never opened without the
   * customer's own tap.
   */
  const openGoogle = useCallback((): boolean => {
    if (!reviewUrl) return false
    const probe = window.open('', '_blank')
    if (!probe) {
      setPopupBlocked(true)
      return false
    }
    probe.close()
    window.open(reviewUrl, '_blank', 'noopener,noreferrer')
    onReviewed?.()
    setOpened(true)
    return true
  }, [reviewUrl, onReviewed])

  /**
   * The one-click experience: a tap on a review card copies that text and
   * opens the Google review tab ready for a paste. The text is kept in view
   * either way, so a failed copy still leaves the customer a manual path.
   */
  const handlePick = useCallback(
    (suggestion: string) => {
      setSelected(suggestion)
      setCopied(false)
      setPopupBlocked(false)
      setOpened(false)
      void copyText(suggestion)
      openGoogle()
    },
    [copyText, openGoogle],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share Your Experience"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-paper sm:rounded-2xl"
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
          <p className="mb-3 text-sm text-muted">
            Tap a review - it is copied for you to paste on Google. You can edit it there before you
            post.
          </p>
          <p className="mb-3 text-sm text-muted">
            Nothing is filled in or posted automatically - paste, edit and choose the rating that
            matches your experience.
          </p>

          {/* Topic chips: narrow the suggestions to what the customer wants
              to talk about, then pick a starter below. */}
          <div role="group" aria-label="Review topic" className="mb-3 flex flex-wrap gap-1.5">
            {TOPICS.map((t) => {
              const activeNow = topic === t
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={activeNow}
                  onClick={() => setTopic(t)}
                  className={cn(
                    'tap-target rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    activeNow
                      ? 'border-gold bg-gold/15 text-ink'
                      : 'border-border-soft bg-paper text-muted hover:border-gold hover:text-ink',
                  )}
                >
                  {t}
                </button>
              )
            })}
          </div>

          {/* Review cards: one tap copies the text and opens the Google tab */}
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.filter(({ topics: ts }) => topic === 'All' || ts.includes(topic)).map(({ text: suggestion, icon }) => {
              const selectedNow = selected === suggestion
              return (
                <button
                  key={suggestion}
                  type="button"
                  aria-pressed={selectedNow}
                  onClick={() => handlePick(suggestion)}
                  className={cn(
                    'review-suggestion tap-target flex min-h-[54px] items-center gap-3 border px-3 py-2.5 text-left text-sm leading-5 text-ink transition-colors',
                    selectedNow
                      ? 'border-gold bg-gold/10 shadow-[inset_0_0_0_1px_var(--house-gold)]'
                      : 'border-border-soft bg-paper hover:border-gold hover:bg-gold/5',
                  )}
                >
                  <IconGlyph kind={icon} />
                  <span className="flex-1">{suggestion}</span>
                </button>
              )
            })}
          </div>

          {/* Feedback after a tap: copy status (confirmed only), manual-copy
              help, and the honest "nothing is posted" line. */}
          {(selected || opened) && (
            <div className="review-message mt-4 p-3">
              {opened && (
                <p role="status" className="text-sm font-medium text-green-700">
                  ✓ Google is opening in a new tab. Nothing is filled in or posted automatically.
                </p>
              )}
              {copied && (
                <p role="status" className="text-sm font-medium text-green-700">
                  ✓ Copied - paste it into your review on Google.
                </p>
              )}
              {copyError && (
                <>
                  <p role="alert" className="text-sm text-red-600">
                    {copyError}
                  </p>
                  <label htmlFor="review-manual-text" className="sr-only">
                    Review text to copy
                  </label>
                  <textarea
                    id="review-manual-text"
                    className="field-input mt-2 min-h-20 resize-y p-3 text-base leading-6"
                    readOnly
                    value={selected ?? ''}
                  />
                </>
              )}
            </div>
          )}

          {popupBlocked && (
            <div role="alert" className="review-message mt-4 p-3">
              <p className="text-sm font-medium text-ink">Your browser blocked the new tab.</p>
              <p className="mt-1 text-sm text-muted">
                Use the link below to open Google and paste your text into your review.
              </p>
              {reviewUrl && (
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onReviewed?.()}
                  className="btn-secondary tap-target mt-2 inline-flex min-h-11 items-center justify-center"
                >
                  Open Google Reviews
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t border-border-soft bg-paper px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary tap-target min-h-12"
              disabled={!reviewUrl}
              onClick={openGoogle}
            >
              Open Google
            </button>
            <button type="button" className="btn-ghost tap-target min-h-12" onClick={onSkip}>
              Skip for now
            </button>
          </div>
          <p className="text-xs text-muted">
            This is optional. You can skip this step; your reward is based only on your purchase
            amount and is never affected by a review.
          </p>
        </footer>
      </div>
    </div>
  )
}
