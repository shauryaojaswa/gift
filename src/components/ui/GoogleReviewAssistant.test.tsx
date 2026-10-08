import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoogleReviewAssistant } from './GoogleReviewAssistant'
import { StoreConfigProvider } from '../../features/customer-flow/StoreContext'
import { JOLLY_ENTERPRISES } from '../../lib/stores'
import { DEFAULT_GOOGLE_REVIEW_URL } from '../../lib/google-review'

const reviewUrl = DEFAULT_GOOGLE_REVIEW_URL
const firstOption = 'Beautiful jewellery collection.'

function renderAssistant(url: string | null = reviewUrl) {
  return render(
    <StoreConfigProvider store={{ ...JOLLY_ENTERPRISES, googleReviewUrl: url }}>
      <GoogleReviewAssistant />
    </StoreConfigProvider>,
  )
}

function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: /leave a google review/i }))
  return screen.getByRole('dialog', { name: 'Share Your Experience' })
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
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Google review assistant', () => {
  it("uses Google's canonical review-form URL for Shree Jewellers", () => {
    expect(DEFAULT_GOOGLE_REVIEW_URL).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJwVPgCwAdwTsR7AHj3vrZvA4',
    )
  })

  it('copies a selected quick review immediately and opens Google with one more tap', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const { tab, open } = mockReviewTab()
    renderAssistant()

    openAssistant()
    expect(screen.getByText('Share details of your experience at this store in your own words.'))
      .toBeInTheDocument()
    const option = screen.getByRole('button', { name: firstOption })
    fireEvent.click(option)

    expect(writeText).toHaveBeenCalledWith(firstOption)
    expect(option).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.getByText('✓ Review copied')).toBeInTheDocument())
    expect(screen.getByText('Ready to paste into Google')).toBeInTheDocument()
    const openButton = screen.getByRole('button', { name: 'Open Google →' })
    fireEvent.click(openButton)
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
    expect(tab.opener).toBeNull()
    expect(screen.getByText('Choose the rating that matches your experience.')).toBeInTheDocument()
    expect(screen.getByText(
      'Your review is copied. Paste it into Google and choose the rating that matches your experience.',
    )).toBeInTheDocument()
  })

  it('shows all twelve large, simple sentence options without requiring a topic choice', () => {
    renderAssistant()
    openAssistant()
    expect(screen.getByRole('button', { name: 'Very helpful and friendly staff.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I really liked the jewellery designs.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Good quality and good service.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Very smooth shopping experience.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The staff helped me choose the right jewellery.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I was happy with the overall experience.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Good value for the quality.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I found exactly what I was looking for.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nice experience from start to finish.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The collection had many beautiful options.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My visit was a pleasant experience.' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Your review text' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Choose a review' })).toBeDisabled()
  })

  it('copies edited text and opens Google directly from the same click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const { open, tab } = mockReviewTab()
    renderAssistant()
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: firstOption }))
    await waitFor(() => screen.getByRole('button', { name: 'Open Google →' }))

    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    fireEvent.change(textarea, { target: { value: 'I really liked the bridal collection.' } })
    expect(screen.getByText('Review edited')).toBeInTheDocument()
    const primary = screen.getByRole('button', { name: 'Copy & Open Google →' })
    fireEvent.click(primary)

    expect(open).toHaveBeenCalledWith('', '_blank')
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith('I really liked the bridal collection.'),
    )
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(reviewUrl))
    expect(screen.getByText('✓ Review copied')).toBeInTheDocument()
    expect(screen.getByText(
      'Your review is copied. Paste it into Google and choose the rating that matches your experience.',
    )).toBeInTheDocument()
  })

  it('opens a blank custom review and copies it when opening Google', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const { open, tab } = mockReviewTab()
    renderAssistant()
    openAssistant()

    fireEvent.click(screen.getByRole('button', { name: /write your own review/i }))
    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    expect(textarea).toHaveValue('')
    expect(textarea).toHaveFocus()
    expect(textarea).toHaveAttribute('placeholder', 'Write in your own words...')
    fireEvent.change(textarea, { target: { value: 'My visit was pleasant.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy & Open Google →' }))

    expect(open).toHaveBeenCalledWith('', '_blank')
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('My visit was pleasant.'))
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(reviewUrl))
  })

  it('shows a selectable clipboard fallback and can retry copying', async () => {
    const writeText = vi.fn()
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce(undefined)
    mockClipboard(writeText)
    const { open } = mockReviewTab()
    renderAssistant()
    openAssistant()

    fireEvent.click(screen.getByRole('button', { name: firstOption }))
    await waitFor(() => expect(screen.getByText('Copy this review, then paste it into Google.')).toBeInTheDocument())
    const fallback = screen.getByRole('textbox', { name: 'Review text to copy' })
    expect(fallback).toHaveValue(firstOption)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Again' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(firstOption))
    await waitFor(() => expect(screen.getByText('✓ Review copied')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Open Google →' }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
  })

  it('offers an explicit Google action when a popup is blocked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    renderAssistant()
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: firstOption }))
    await waitFor(() => screen.getByRole('button', { name: 'Open Google →' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open Google →' }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
    expect(screen.getByRole('alert')).toHaveTextContent('Google could not be opened automatically.')
    fireEvent.click(screen.getByRole('button', { name: 'Open Google Review' }))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('uses the supplied store review URL by default when no URL is configured', async () => {
    const { open } = mockReviewTab()
    mockClipboard(vi.fn().mockResolvedValue(undefined))
    renderAssistant(null)
    openAssistant()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a review' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: firstOption }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Google →' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Google →' }))
    expect(open).toHaveBeenCalledWith(reviewUrl, '_blank')
  })

  it('rejects a non-Google URL and prioritizes the configured environment URL', async () => {
    renderAssistant('https://example.com/fake-review')
    openAssistant()
    expect(screen.getByRole('alert')).toHaveTextContent('The Google review link is invalid')
    cleanup()

    mockClipboard(vi.fn().mockResolvedValue(undefined))
    vi.stubEnv('VITE_GOOGLE_REVIEW_URL', reviewUrl)
    const { open, tab } = mockReviewTab()
    renderAssistant('https://example.com/ignored')
    openAssistant()
    fireEvent.click(screen.getByRole('button', { name: /write your own review/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'My honest review.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy & Open Google →' }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    await waitFor(() => expect(screen.getByText('✓ Review copied')).toBeInTheDocument())
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(reviewUrl))
  })
})
