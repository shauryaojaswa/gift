import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoogleReviewAssistant } from './GoogleReviewAssistant'
import { StoreConfigProvider } from '../../features/customer-flow/StoreContext'
import { JOLLY_ENTERPRISES } from '../../lib/stores'

const reviewUrl = 'https://search.google.com/local/writereview?placeid=test-place'

function renderAssistant(url: string | null = reviewUrl) {
  return render(
    <StoreConfigProvider store={{ ...JOLLY_ENTERPRISES, googleReviewUrl: url }}>
      <GoogleReviewAssistant />
    </StoreConfigProvider>,
  )
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

function mockClipboard(writeText?: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_REVIEW_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Google review assistant', () => {
  it('opens the helper, selects an optional starter, allows edits, copies it, and opens Google', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const { tab, open } = mockReviewTab()
    renderAssistant()

    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    expect(screen.getByRole('dialog', { name: 'Share your experience ❤️' })).toBeInTheDocument()
    expect(screen.getByText(/Please only use what is true for you/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(12)

    const starter = screen.getByRole('button', { name: 'Staff was friendly and helpful.' })
    fireEvent.click(starter)
    expect(starter).toHaveAttribute('aria-pressed', 'true')
    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    fireEvent.change(textarea, { target: { value: 'Staff was friendly and helpful. I chose this myself.' } })

    fireEvent.click(screen.getByRole('button', { name: 'Copy & Continue to Google' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Staff was friendly and helpful. I chose this myself.'))
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(tab.location.replace).toHaveBeenCalledWith(reviewUrl)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your review text has been copied. Google will ask you to choose your rating and submit the review.',
    )
  })

  it('shows editable Hinglish and Hindi starters and counts Hindi text', () => {
    renderAssistant()
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    const language = screen.getByLabelText('Choose a language')

    fireEvent.change(language, { target: { value: 'hinglish' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bahut achha experience raha. Service ______ thi.' }))
    expect(screen.getByRole('textbox', { name: 'Your review text' })).toHaveValue(
      'Bahut achha experience raha. Service ______ thi.',
    )

    fireEvent.change(language, { target: { value: 'hindi' } })
    fireEvent.click(screen.getByRole('button', { name: 'मेरा अनुभव बहुत अच्छा रहा। सेवा ______ थी।' }))
    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    expect(textarea).toHaveValue('मेरा अनुभव बहुत अच्छा रहा। सेवा ______ थी।')
    expect(screen.getByText(`${Array.from('मेरा अनुभव बहुत अच्छा रहा। सेवा ______ थी।').length} characters`)).toBeInTheDocument()
  })

  it('clears the draft for a self-written review and prevents continuing with empty text', () => {
    const { open } = mockReviewTab()
    renderAssistant()
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Good quality and good service.' }))
    fireEvent.click(screen.getByRole('button', { name: /write your own review/i }))
    expect(screen.getByRole('textbox', { name: 'Your review text' })).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Copy & Continue to Google' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Write a few words first')
    expect(open).not.toHaveBeenCalled()
  })

  it('keeps the review text visible and opens Google when clipboard access is unavailable', async () => {
    mockClipboard()
    const { tab } = mockReviewTab()
    renderAssistant()
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'मेरा अनुभव अच्छा रहा।' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy & Continue to Google' }))
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(reviewUrl))
    expect(screen.getByRole('status')).toHaveTextContent("We couldn't copy automatically")
    expect(screen.getByRole('textbox', { name: 'Your review text' })).toHaveValue('मेरा अनुभव अच्छा रहा।')
    expect(screen.getByRole('button', { name: 'Open Google Review' })).toBeInTheDocument()
  })

  it('shows an administrator error when the review URL is missing', () => {
    const { open } = mockReviewTab()
    renderAssistant(null)
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Google review link is not set up yet')
    expect(screen.getByRole('button', { name: 'Open Google Review' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'My honest review.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy & Continue to Google' }))
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a non-Google URL and uses the environment URL over the store URL', () => {
    const invalidConfig = renderAssistant('https://example.com/fake-review')
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('The Google review link is invalid')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    invalidConfig.unmount()

    vi.stubEnv('VITE_GOOGLE_REVIEW_URL', reviewUrl)
    const { open } = mockReviewTab()
    renderAssistant('https://example.com/ignored')
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Google Review' }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank', 'noopener,noreferrer')
  })

  it('accepts a Google Business Profile review link', () => {
    const businessProfileUrl = 'https://business.google.com/locations/location-id/reviews'
    const { open } = mockReviewTab()
    renderAssistant(businessProfileUrl)
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Google Review' }))
    expect(open).toHaveBeenCalledWith(businessProfileUrl, '_blank', 'noopener,noreferrer')
  })

  it('supports long editable reviews without truncation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const { tab } = mockReviewTab()
    renderAssistant()
    fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
    const longHindiText = 'अच्छा '.repeat(1000)
    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: longHindiText },
    })
    expect(screen.getByText(`${Array.from(longHindiText).length} characters`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy & Continue to Google' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(longHindiText))
    expect(tab.location.replace).toHaveBeenCalledWith(reviewUrl)
  })
})
