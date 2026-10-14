import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

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
    case 'gift':
      return (<svg {...common}><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 7v14" /><path d="M12 7S10.5 3 8.5 3a2.5 2.5 0 0 0 0 5zM12 7s1.5-4 3.5-4a2.5 2.5 0 0 1 0 5z" /></svg>)
    default:
      return (<svg {...common}><circle cx="12" cy="12" r="9" /></svg>)
  }
}

const SUGGESTIONS: Array<{ text: string; icon: string }> = [
  { text: 'Beautiful jewellery collection.', icon: 'gem' },
  { text: 'Very helpful and friendly staff.', icon: 'user' },
  { text: 'I really liked the jewellery designs.', icon: 'sparkle' },
  { text: 'Good quality and good service.', icon: 'badge' },
  { text: 'Very smooth shopping experience.', icon: 'bag' },
  { text: 'The staff helped me choose the right jewellery.', icon: 'hands' },
  { text: 'I was happy with the overall experience.', icon: 'heart' },
  { text: 'Good value for the quality.', icon: 'tag' },
  { text: 'I found exactly what I was looking for.', icon: 'package' },
  { text: 'Nice experience from start to finish.', icon: 'smile' },
  { text: 'The collection had many beautiful options.', icon: 'gift' },
  { text: 'My visit was a pleasant experience.', icon: 'sparkle' },
]

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
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setText('')
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

  const copyText = useCallback(async (value: string) => {
    if (!value) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyError('Could not copy automatically. Please select and copy the text manually.')
    }
  }, [])

  const handleSelectSuggestion = useCallback(
    (suggestion: string) => {
      setText(suggestion)
      void copyText(suggestion)
    },
    [copyText],
  )

  const handleWriteOwn = useCallback(() => {
    setText((current) => (SUGGESTIONS.some((s) => s.text === current) ? '' : current))
    setTimeout(() => textareaRef.current?.focus(), 30)
  }, [])

  const handleCopyAndOpen = useCallback(() => {
    void copyText(text)
    if (reviewUrl) {
      window.open(reviewUrl, '_blank', 'noopener,noreferrer')
    }
    onSkip()
  }, [copyText, text, reviewUrl, onSkip])

  const handleOpenGoogle = useCallback(() => {
    if (reviewUrl) {
      window.open(reviewUrl, '_blank', 'noopener,noreferrer')
    }
  }, [reviewUrl])

  if (!open) return null

  const hasText = text.trim().length > 0

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
          {/* Suggestions */}
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map(({ text: suggestion, icon }) => {
              const selected = text === suggestion
              return (
                <button
                  key={suggestion}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className={cn(
                    'review-suggestion tap-target flex min-h-[54px] items-center gap-3 border px-3 py-2.5 text-left text-sm leading-5 text-ink transition-colors',
                    selected
                      ? 'border-brand bg-brand/5 shadow-[inset_0_0_0_1px_var(--house-burgundy)]'
                      : 'border-border-soft bg-paper hover:border-gold hover:bg-gold/5',
                  )}
                >
                  <IconGlyph kind={icon} />
                  <span className="flex-1">{suggestion}</span>
                  {selected && copied && (
                    <span className="shrink-0 text-xs font-medium text-green-700">✓ Copied</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Own words */}
          <p className="mb-1 mt-5 text-sm font-medium text-ink">Want to add your own words?</p>
          <label htmlFor="review-text" className="sr-only">
            Your review text
          </label>
          <textarea
            id="review-text"
            ref={textareaRef}
            className="field-input min-h-24 resize-y p-3 text-base leading-6"
            placeholder="Write in your own words..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
            {text.length} characters
          </p>
          <button
            type="button"
            onClick={handleWriteOwn}
            className="tap-target mt-2 inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-sm font-medium text-brand hover:bg-brand/5"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 21h8" />
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            </svg>
            ✍ Write Your Own Review
          </button>

          {/* Copy guidance once there is text */}
          {hasText && (
            <div className="review-message mt-2 p-3">
              <p className="text-sm font-medium">Copy this review, then paste it into Google.</p>
              <label htmlFor="review-fallback-text" className="sr-only">
                Review text to copy
              </label>
              <textarea
                id="review-fallback-text"
                className="field-input mt-2 min-h-20 resize-y p-3 text-base leading-6"
                readOnly
                value={text}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary tap-target mt-2 min-h-11"
                  onClick={() => void copyText(text)}
                >
                  Copy Again
                </button>
                <button
                  type="button"
                  className="btn-ghost tap-target mt-2 min-h-11"
                  onClick={handleOpenGoogle}
                >
                  Open Google Review
                </button>
              </div>
              {copied && (
                <p role="status" className="mt-2 text-sm font-medium text-green-700">
                  Copied to clipboard
                </p>
              )}
              {copyError && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {copyError}
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-sm text-muted">Choose the rating that matches your experience.</p>
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t border-border-soft bg-paper px-5 py-4 sm:px-6">
          <button
            type="button"
            className="btn-primary tap-target min-h-12"
            disabled={!hasText}
            onClick={handleCopyAndOpen}
          >
            Copy &amp; Open Google →
          </button>
        </footer>
      </div>
    </div>
  )
}
