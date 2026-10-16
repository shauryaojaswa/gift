import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GoogleReviewAssistant } from './GoogleReviewAssistant'

/**
 * Google Review Assistant policy tests (v1.3.0 requirements):
 * - the seven topic chips and ten review starters are exactly the approved set
 * - starters are writing prompts only - no praise, ratings or fabricated
 *   experiences, and they never suggest a testimonial
 * - selecting a prompt or topic only inserts editable text; it never touches
 *   the clipboard
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

  it('shows exactly the seven approved topic chips and the ten approved review starters', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    const topics = Array.from(document.querySelectorAll<HTMLButtonElement>('.review-topic')).map(
      (b) => (b.textContent ?? '').trim(),
    )
    expect(topics).toEqual([
      'Service',
      'Collection',
      'Staff',
      'Quality',
      'Price',
      'Shopping Experience',
      'My Visit',
    ])
    const prompts = suggestionButtons().map((b) => (b.textContent ?? '').trim())
    expect(prompts).toEqual([
      'I visited this shop to look at the jewellery collection.',
      'I was looking for a particular type of jewellery.',
      'I found the collection interesting.',
      'The staff helped me with my questions.',
      'I wanted to know more about the jewellery designs.',
      'I compared the prices of different items.',
      'I was looking for a gift for someone.',
      'I visited to explore the available options.',
      'My shopping experience included the following.',
      'I would like to share what I experienced during my visit.',
    ])
    for (const text of prompts) {
      for (const phrase of TESTIMONIAL_PHRASES) {
        expect(
          text.toLowerCase().includes(phrase),
          `starter must not suggest a testimonial: ${text}`,
        ).toBe(false)
      }
    }
    // The framing invites the customer's own honest words.
    expect(screen.getByText(/your own honest words/i)).toBeInTheDocument()
  })

  it('inserts a topic chip as editable starting text WITHOUT writing to the clipboard', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Service' }))
    const textarea = screen.getByRole('textbox', { name: 'Your review text' }) as HTMLTextAreaElement
    expect(textarea.value).toBe('Service: ')
    expect(writeText).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
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

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    return vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/select and copy the text manually/i)
    })
  })

  it('provides exactly the four explicit customer-controlled actions', async () => {
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
    // The primary actions are exactly Copy / Open Google Reviews / Skip for now / Continue.
    const names = Array.from(document.querySelectorAll<HTMLButtonElement>('footer button')).map(
      (b) => (b.textContent ?? '').trim(),
    )
    expect(names).toEqual(['Copy', 'Open Google Reviews', 'Continue', 'Skip for now'])

    const copy = screen.getByRole('button', { name: 'Copy' })
    const open = screen.getByRole('button', { name: 'Open Google Reviews' })
    expect(copy).toBeDisabled()
    expect(open).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Your review text' }), {
      target: { value: 'Honest words' },
    })
    expect(copy).toBeEnabled()
    expect(open).toBeEnabled()

    // Copy is explicit and confirmed only after the platform confirms it.
    fireEvent.click(copy)
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Honest words')
      expect(screen.getByText(/Copied to clipboard/i)).toBeInTheDocument()
    })
    expect(openSpy).not.toHaveBeenCalled()

    // Opening Google is a separate explicit action; nothing auto-continues.
    fireEvent.click(open)
    await vi.waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://g.page/r/example', '_blank', 'noopener,noreferrer')
      expect(onReviewed).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Google is opening in a new tab/i)).toBeInTheDocument()
    })
    expect(onSkip).not.toHaveBeenCalled()

    // Continue and Skip for now are the explicit ways onward.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
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
    fireEvent.click(screen.getByRole('button', { name: 'Open Google Reviews' }))

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/blocked the new tab/i)
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(onReviewed).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
    // The customer keeps an explicit, unblocked way to open Google.
    expect(screen.getByRole('link', { name: 'Open Google Reviews' })).toHaveAttribute(
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
    // The review action is disabled without a configured link; nothing opens.
    const open = screen.getByRole('button', { name: 'Open Google Reviews' })
    expect(open).toBeDisabled()
    fireEvent.click(open)
    expect(openSpy).not.toHaveBeenCalled()
    expect(onReviewed).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
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
