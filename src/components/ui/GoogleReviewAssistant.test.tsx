import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoogleReviewAssistant } from './GoogleReviewAssistant'
import { StoreConfigProvider } from '../../features/customer-flow/StoreContext'
import { JOLLY_ENTERPRISES } from '../../lib/stores'
import { DEFAULT_GOOGLE_REVIEW_URL } from '../../lib/google-review'

const reviewUrl = DEFAULT_GOOGLE_REVIEW_URL

function renderAssistant(url: string | null = reviewUrl, onGoogleReturn?: () => void) {
  return render(
    <StoreConfigProvider store={{ ...JOLLY_ENTERPRISES, googleReviewUrl: url }}>
      <GoogleReviewAssistant onGoogleReturn={onGoogleReturn} />
    </StoreConfigProvider>,
  )
}

function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
  return screen.getByRole('dialog', { name: 'Share Your Experience' })
}

function normaliseText(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function hasText(container: HTMLElement, text: string): boolean {
  const haystack = normaliseText(container.textContent)
  return haystack.includes(normaliseText(text))
}

function mockReviewTab() {
  const tab = {
    opener: window,
    location: { replace: vi.fn() },
    close: vi.fn(),
  } as unknown as Window
  const open = vi.fn(() => tab)
  vi.stubGlobal('open', open)
  return { tab, open }
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_REVIEW_URL', '')
  window.sessionStorage.removeItem('gift:review-return:jolly-enterprises')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Google review assistant', () => {
  it("uses Google's canonical review-form URL for the store", () => {
    expect(DEFAULT_GOOGLE_REVIEW_URL).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJwVPgCwAdwTsR7AHj3vrZvA4',
    )
  })

  it('never offers pre-written or fabricated review text', () => {
    const dialog = document.body
    renderAssistant()
    openAssistant()
    // The old assistant copied canned sentences to the clipboard. It must not do that anymore.
    expect(screen.queryByText('Beautiful jewellery collection.')).not.toBeInTheDocument()
    expect(screen.queryByText('Very helpful and friendly staff.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
    expect(hasText(dialog, 'We never write, suggest, or submit a review for you.')).toBe(true)
  })

  it('opens the real Google review page in a new tab without fabricating a review', () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { tab, open } = mockReviewTab()
    renderAssistant()

    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Leave a Google Review' }))

    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
    expect(tab.opener).toBeNull()
    // No clipboard usage whatsoever — we never fabricate or prefill review text.
    expect(writeText).not.toHaveBeenCalled()
  })

  it('can be dismissed with a "Not now" action', () => {
    renderAssistant()
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog', { name: 'Share Your Experience' })).not.toBeInTheDocument()
  })

  it('advances the flow only after the customer returns from an opened Google tab', async () => {
    const onGoogleReturn = vi.fn()
    const { open } = mockReviewTab()
    renderAssistant(reviewUrl, onGoogleReturn)

    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Leave a Google Review' }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
    expect(onGoogleReturn).not.toHaveBeenCalled()

    // Simulate leaving the tab and returning.
    fireEvent.blur(window)
    fireEvent.focus(window)

    await waitFor(() => expect(onGoogleReturn).toHaveBeenCalledTimes(1))
  })

  it('offers an explicit Google action when a popup is blocked', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    renderAssistant()
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Leave a Google Review' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Google could not be opened automatically.')
    fireEvent.click(screen.getByRole('button', { name: 'Open Google Review' }))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('disables the primary action when the review link is not set up', () => {
    renderAssistant('https://example.com/not-google')
    openAssistant()
    expect(screen.getByRole('alert')).toHaveTextContent('The Google review link is invalid')
    expect(screen.getByRole('button', { name: 'Google link not set up' })).toBeDisabled()
  })

  it('prioritizes the configured environment URL over the store setting', () => {
    const { open } = mockReviewTab()
    vi.stubEnv('VITE_GOOGLE_REVIEW_URL', reviewUrl)
    renderAssistant('https://example.com/ignored')
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Leave a Google Review' }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
  })
})
