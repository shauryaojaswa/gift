import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GoogleReviewAssistant } from './GoogleReviewAssistant'

/**
 * Google Review Assistant policy tests (Phase 6 requirements):
 * - topic prompts are neutral questions, never suggested testimonial text
 * - selecting a prompt only inserts editable text; it never touches the clipboard
 * - copying happens only through explicit user-initiated copy buttons
 * - the assistant is optional and never gates the reward (skip path works)
 */

const TESTIMONIAL_PHRASES = [
  'excellent',
  'amazing',
  'wonderful',
  'highly recommend',
  'must visit',
  'best jewellery',
  'beautiful jewellery',
  'outstanding',
  'fantastic',
  '5-star',
  'five star',
]

function suggestionButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
}

const noop = () => {}

describe('GoogleReviewAssistant', () => {
  let writeText: ReturnType<typeof vi.fn>
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('renders nothing when closed', () => {
    render(
      <GoogleReviewAssistant
        open={false}
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows only neutral, question-style topic prompts — never suggested testimonials', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    const prompts = suggestionButtons()
    expect(prompts.length).toBeGreaterThan(0)
    for (const button of prompts) {
      const text = (button.textContent ?? '').trim().toLowerCase()
      expect(text.endsWith('?'), `prompt must be an open question: ${text}`).toBe(true)
      for (const phrase of TESTIMONIAL_PHRASES) {
        expect(text.includes(phrase), `prompt must not suggest a testimonial: ${text}`).toBe(false)
      }
    }
    // The framing invites the customer's own honest words.
    expect(screen.getByText(/write your own honest words/i)).toBeInTheDocument()
  })

  it('inserts a prompt as editable text on click WITHOUT writing to the clipboard', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    const [first] = suggestionButtons()
    fireEvent.click(first)

    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    expect((textarea as HTMLTextAreaElement).value).toBe(first.textContent?.trim())
    expect(writeText).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('copies only when the customer explicitly clicks the copy button', async () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    fireEvent.change(textarea, { target: { value: 'My own honest words.' } })
    expect(writeText).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Copy Again' }))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('My own honest words.')
    // Feedback appears once the async clipboard write resolves.
    await vi.waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
    })
  })

  it('shows a manual-copy fallback when clipboard access fails', () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    fireEvent.change(textarea, { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Again' }))
    return vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/select and copy the text manually/i)
    })
  })

  it('copy-and-open is disabled without text, then copies and continues with text', async () => {
    openSpy.mockReturnValue({} as Window) // the browser opens the new tab
    const onReviewed = vi.fn()
    const onSkip = vi.fn()
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={onSkip}
        onReviewed={onReviewed}
        reviewUrl="https://g.page/r/example"
      />,
    )
    const cta = screen.getByRole('button', { name: /Copy & Open Google/i })
    expect(cta).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'Honest words' },
    })
    fireEvent.click(cta)

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Honest words')
      expect(openSpy).toHaveBeenCalledWith('https://g.page/r/example', '_blank', 'noopener,noreferrer')
      expect(onReviewed).toHaveBeenCalledTimes(1)
    })
    // Copy is confirmed to the customer only after the platform confirms it.
    await vi.waitFor(() => {
      expect(screen.getByText(/Copied to your clipboard/i)).toBeInTheDocument()
    })
    await vi.waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1), { timeout: 2500 })
  })

  it('shows a popup-blocked fallback without losing the flow', async () => {
    openSpy.mockReturnValue(null) // the browser blocked the new tab
    const onReviewed = vi.fn()
    const onSkip = vi.fn()
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={onSkip}
        onReviewed={onReviewed}
        reviewUrl="https://g.page/r/example"
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'Honest words' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Copy & Open Google/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/blocked the new tab/i)
    })
    expect(writeText).toHaveBeenCalledWith('Honest words')
    expect(onReviewed).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
    // The customer keeps an explicit, unblocked way to open Google.
    expect(screen.getByRole('link', { name: 'Open Google Review' })).toHaveAttribute(
      'href',
      'https://g.page/r/example',
    )
  })

  it('never calls the review link when the shop has none configured (skippable)', async () => {
    const onReviewed = vi.fn()
    const onSkip = vi.fn()
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={onSkip}
        onReviewed={onReviewed}
        reviewUrl={null}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'Hi' },
    })
    // The review-link button only appears once there is text to share.
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Google Review' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open Google Review' }))
    expect(openSpy).not.toHaveBeenCalled()
    expect(onReviewed).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Copy & Open Google/i }))
    expect(openSpy).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1), { timeout: 2500 })
  })

  it('clears a selected prompt when the customer chooses to write their own', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    fireEvent.click(suggestionButtons()[0])
    const textarea = screen.getByRole('textbox', { name: 'Your review text' })
    expect((textarea as HTMLTextAreaElement).value).not.toBe('')

    fireEvent.click(screen.getByRole('button', { name: /Write Your Own Review/i }))
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })
})
