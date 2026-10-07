import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PenLine, Star, X } from 'lucide-react'
import { useStoreConfigValue } from '@/features/customer-flow/StoreContext'

type ReviewLanguage = 'english' | 'hinglish' | 'hindi'

const suggestions: Record<ReviewLanguage, string[]> = {
  english: [
    'Very good experience. The service was ______.',
    'Staff was friendly and helpful.',
    'Good quality and good service.',
    'The service was quick and smooth.',
    'Nice experience and reasonable pricing.',
    'I was happy with the service and would visit again.',
    'The staff explained everything clearly and helped me choose.',
    'Good place, polite staff and good overall experience.',
    'I liked the quality and the way I was treated.',
    'Overall a very good experience.',
    'I came here for ______ and was happy with the service.',
    'The best thing about my visit was ______.',
  ],
  hinglish: [
    'Bahut achha experience raha. Service ______ thi.',
    'Staff kaafi friendly aur helpful tha.',
    'Quality achhi thi aur service bhi achhi mili.',
    'Service quick aur smooth thi.',
    'Price reasonable laga aur overall experience achha tha.',
    'Mera experience achha raha, main dobara aaunga/aaungi.',
    'Staff ne clearly explain kiya aur choose karne mein help ki.',
    'Overall service aur behaviour dono achhe the.',
    'Quality mujhe achhi lagi aur staff ka behaviour bhi polite tha.',
    'Overall bahut achha experience raha.',
    'Main ______ ke liye aaya/aayi tha aur service se satisfied raha/rahi.',
    'Mujhe sabse achhi cheez ______ lagi.',
  ],
  hindi: [
    'मेरा अनुभव बहुत अच्छा रहा। सेवा ______ थी।',
    'स्टाफ मिलनसार और मददगार था।',
    'क्वालिटी अच्छी थी और सेवा भी अच्छी मिली।',
    'सेवा जल्दी और आसानी से मिली।',
    'कीमत ठीक लगी और अनुभव अच्छा रहा।',
    'मेरा अनुभव अच्छा रहा। मैं फिर आना चाहूँगा/चाहूँगी।',
    'स्टाफ ने अच्छी तरह समझाया और चुनने में मदद की।',
    'सेवा और व्यवहार दोनों अच्छे थे।',
    'मुझे क्वालिटी अच्छी लगी और स्टाफ का व्यवहार भी अच्छा था।',
    'कुल मिलाकर अनुभव बहुत अच्छा रहा।',
    'मैं ______ के लिए आया/आई था/थी और सेवा से खुश था/थी।',
    'मेरी विज़िट की सबसे अच्छी बात ______ थी।',
  ],
}

const languageLabels: Record<ReviewLanguage, string> = {
  english: 'Simple English',
  hinglish: 'Hinglish',
  hindi: 'Hindi',
}

function configuredReviewUrl(storeUrl: string | null): { url: string | null; error: string | null } {
  const envUrl = import.meta.env.VITE_GOOGLE_REVIEW_URL?.trim()
  const candidate = envUrl || storeUrl?.trim()
  if (!candidate) {
    return {
      url: null,
      error: 'Google review link is not set up yet. Please ask the store administrator to add it in Store Settings or set VITE_GOOGLE_REVIEW_URL.',
    }
  }

  try {
    const parsed = new URL(candidate)
    const hostname = parsed.hostname.toLowerCase()
    const isGoogleDomain =
      /(^|\.)google\.(com|co\.[a-z]{2}|[a-z]{2,})$/.test(hostname) ||
      hostname === 'g.page' ||
      hostname === 'maps.app.goo.gl' ||
      hostname === 'share.google'

    if (parsed.protocol !== 'https:' || !isGoogleDomain || parsed.username || parsed.password) {
      throw new Error('Invalid Google review URL')
    }

    return { url: parsed.href, error: null }
  } catch {
    return {
      url: null,
      error: 'The Google review link is invalid. Please ask the store administrator to check Store Settings or VITE_GOOGLE_REVIEW_URL.',
    }
  }
}

export function GoogleReviewAssistant({ className = 'btn-primary' }: { className?: string }) {
  const store = useStoreConfigValue()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [language, setLanguage] = useState<ReviewLanguage>('english')
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reviewLink = useMemo(
    () => configuredReviewUrl(store.googleReviewUrl),
    [store.googleReviewUrl],
  )

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
    setMessage(null)
    setError(null)
    setIsOpen(true)
  }

  const chooseSuggestion = (index: number) => {
    setSelectedSuggestion(index)
    setReviewText(suggestions[language][index])
    setError(null)
  }

  const changeLanguage = (nextLanguage: ReviewLanguage) => {
    setLanguage(nextLanguage)
    setSelectedSuggestion(null)
    setError(null)
  }

  const writeOwnReview = () => {
    setSelectedSuggestion(null)
    setReviewText('')
    setError(null)
    setMessage(null)
  }

  const openGoogleReview = () => {
    if (!reviewLink.url) {
      return
    }
    window.open(reviewLink.url, '_blank', 'noopener,noreferrer')
    setMessage('Google is open in a new tab. Choose the rating that matches your experience.')
  }

  const copyAndContinue = async () => {
    setError(null)
    if (!reviewLink.url) {
      return
    }
    if (!reviewText.trim()) {
      setError('Write a few words first, or choose a sentence above.')
      return
    }

    const reviewTab = window.open('', '_blank')
    if (reviewTab) reviewTab.opener = null

    let copied = false
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available')
      await navigator.clipboard.writeText(reviewText)
      copied = true
    } catch {
      copied = false
    }

    setMessage(
      copied
        ? 'Your review text has been copied. Google will ask you to choose your rating and submit the review.'
        : "We couldn't copy automatically. Your review text is still here—copy it manually. Google will ask you to choose your rating and submit the review.",
    )

    if (reviewTab) {
      try {
        reviewTab.location.replace(reviewLink.url)
      } catch {
        reviewTab.close()
        setMessage((current) => `${current} If Google did not open, use Open Google Review below.`)
      }
    } else {
      setMessage((current) => `${current} If Google did not open, use Open Google Review below.`)
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={openAssistant}>
        ⭐ Leave a Google Review
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false)
            }}
          >
            <section
              aria-labelledby="google-review-heading"
              aria-modal="true"
              className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-paper text-left shadow-2xl sm:rounded-2xl"
              onKeyDown={(event) => {
                if (event.key !== 'Tab') return
                const focusable = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), select:not([disabled]), textarea:not([disabled])',
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
                <h2 id="google-review-heading" className="font-display text-xl font-bold text-ink">
                  Share your experience ❤️
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted">
                  Choose a sentence that matches your experience, or write your own. Please only use what is true for you.
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
              <label htmlFor="review-language" className="mb-1 block text-sm font-medium text-ink">
                Choose a language
              </label>
              <select
                id="review-language"
                className="field-input min-h-11 px-3 py-2"
                value={language}
                onChange={(event) => changeLanguage(event.target.value as ReviewLanguage)}
              >
                {Object.entries(languageLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <p className="mb-2 mt-4 text-sm font-medium text-ink">
                Optional sentence starters — tap one to edit it
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestions[language].map((suggestion, index) => (
                  <button
                    key={`${language}-${index}`}
                    type="button"
                    aria-pressed={selectedSuggestion === index}
                    onClick={() => chooseSuggestion(index)}
                    className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm leading-5 transition-colors ${
                      selectedSuggestion === index
                        ? 'border-brand bg-brand/10 text-ink ring-2 ring-brand/30'
                        : 'border-border-soft bg-white text-ink hover:border-brand/50 hover:bg-cream'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="tap-target mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-brand hover:bg-brand/5"
                onClick={writeOwnReview}
              >
                <PenLine size={17} aria-hidden="true" />
                ✍️ Write your own review
              </button>

              <label htmlFor="review-text" className="sr-only">Your review text</label>
              <textarea
                id="review-text"
                className="field-input mt-2 min-h-28 resize-y p-3 text-base leading-6"
                placeholder="Write in your own words..."
                value={reviewText}
                onChange={(event) => {
                  setReviewText(event.target.value)
                  setSelectedSuggestion(null)
                  setError(null)
                }}
              />
              <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
                {Array.from(reviewText).length} characters
              </p>

              <p className="mt-2 text-xs text-muted">
                Choose the rating that matches your experience. Your review is optional.
              </p>
              {reviewLink.error && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {reviewLink.error}
                </p>
              )}
              {error && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">
                  {message}
                </p>
              )}
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-border-soft bg-paper px-5 py-4 sm:px-6">
              <button
                type="button"
                className="btn-primary tap-target min-h-11"
                onClick={() => void copyAndContinue()}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Star size={17} aria-hidden="true" />
                  Copy &amp; Continue to Google
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-ghost tap-target min-h-11 border border-border-soft text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!reviewLink.url}
                  onClick={openGoogleReview}
                >
                  Open Google Review
                </button>
                <button
                  type="button"
                  className="btn-ghost tap-target min-h-11 text-sm"
                  onClick={() => setIsOpen(false)}
                >
                  Not now
                </button>
              </div>
            </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
