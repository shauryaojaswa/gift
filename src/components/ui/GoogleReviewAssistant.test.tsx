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

function chooseFirstSuggestion() {
  openAssistant()
  fireEvent.click(screen.getByRole('button', { name: 'Beautiful jewellery collection.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Choose a review' }))
}

function mockReviewTab() {
  const tab = { opener: window } as unknown as Window
  const open = vi.fn(() => tab)
  vi.stubGlobal('open', open)
  return { tab, open }
}

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
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

  it('shows topic chips and all ten review suggestions', () => {
    openAssistantWithRender()
    for (const chip of ['Service', 'Collection', 'Staff', 'Quality', 'Price', 'Shopping Experience', 'My Visit']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Beautiful jewellery collection.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Very helpful and friendly staff.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nice experience from start to finish.' })).toBeInTheDocument()
  })

  function openAssistantWithRender() {
    renderAssistant()
    return openAssistant()
  }

  it('copies the chosen suggestion to the clipboard', async () => {
    const writeText = mockClipboard()
    renderAssistant()
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Very helpful and friendly staff.' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Very helpful and friendly staff.'))
  })

  it('shows the confirm step with preview after choosing a review', async () => {
    mockClipboard()
    renderAssistant()
    chooseFirstSuggestion()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your review is ready!' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /copy again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open google reviews/i })).toBeInTheDocument()
  })

  it('opens the real Google review page from the confirm step', async () => {
    mockClipboard()
    const { tab, open } = mockReviewTab()
    renderAssistant()
    chooseFirstSuggestion()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open google reviews/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /open google reviews/i }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
    expect(tab.opener).toBeNull()
  })
  it('advances the flow only after the customer returns from an opened Google tab', async () => {
    mockClipboard()
    const onGoogleReturn = vi.fn()
    const { open } = mockReviewTab()
    renderAssistant(reviewUrl, onGoogleReturn)

    chooseFirstSuggestion()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open google reviews/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /open google reviews/i }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
    expect(onGoogleReturn).not.toHaveBeenCalled()

    fireEvent.blur(window)
    fireEvent.focus(window)

    await waitFor(() => expect(onGoogleReturn).toHaveBeenCalledTimes(1))
  })

  it('offers a manual link when a popup is blocked', async () => {
    mockClipboard()
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    renderAssistant()
    chooseFirstSuggestion()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open google reviews/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /open google reviews/i }))
    expect(screen.getByText(/open Google Reviews manually/i)).toBeInTheDocument()
  })

  it('surfaces a config error when the review link is not set up', () => {
    renderAssistant('https://example.com/not-google')
    openAssistant()
    expect(screen.getByRole('alert')).toHaveTextContent('The Google review link is invalid')
  })

  it('prioritizes the configured environment URL over the store setting', async () => {
    mockClipboard()
    const { open } = mockReviewTab()
    vi.stubEnv('VITE_GOOGLE_REVIEW_URL', reviewUrl)
    renderAssistant('https://example.com/ignored')
    chooseFirstSuggestion()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open google reviews/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /open google reviews/i }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
  })

  it('can go back to suggestions and skip without a review', async () => {
    mockClipboard()
    renderAssistant()
    chooseFirstSuggestion()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your review is ready!' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /back to suggestions/i }))
    expect(screen.getByRole('button', { name: 'Beautiful jewellery collection.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(screen.queryByRole('dialog', { name: 'Share Your Experience' })).not.toBeInTheDocument()
  })
})
