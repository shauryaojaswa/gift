import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GoogleReviewAssistant } from './GoogleReviewAssistant'

/**
 * Google Review Assistant tests (store-specific, customer-approved):
 * - shreejwellers (jewellery) shows EXACTLY the ten review starters approved
 *   in the customer's prototype, verbatim, on the original jewellery topics
 * - shreemanali (clothing) shows the clothing and ethnic-wear starters
 * - the two shops never share or leak each other's recommendations
 * - ONE tap on a card copies that text AND opens the shop's Google review tab
 *   ready for a paste - no typing required
 * - "Copied" appears only on a confirmed clipboard write; on failure the text
 *   stays visible with manual-copy help
 * - a blocked popup keeps an explicit link to Google
 * - Google is never opened without the customer's own tap, nothing is ever
 *   auto-posted, and the reward is never tied to review activity
 */

function suggestionButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button.review-suggestion[aria-pressed]'))
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
        storeSlug="shreejwellers"
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shreejwellers shows exactly the ten approved jewellery starters, verbatim', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreejwellers"
      />,
    )
    const prompts = suggestionButtons().map((b) => (b.textContent ?? '').trim())
    expect(prompts).toEqual([
      'I really liked the jewellery designs.',
      'Good quality and good service.',
      'Very smooth shopping experience.',
      'The staff helped me choose the right jewellery.',
      'I was happy with the overall experience.',
      'Good value for the quality.',
      'I found exactly what I was looking for.',
      'Nice experience from start to finish.',
      'The collection had many beautiful options.',
      'My visit was a pleasant experience.',
    ])
    // The clothing shop's recommendations never appear here.
    expect(screen.queryByText('Loved the ethnic wear collection — so many beautiful options.')).toBeNull()
    expect(screen.queryByText('The fabric and stitching quality of my outfit is excellent.')).toBeNull()
    // No rating is ever prescribed and no review is ever claimed posted.
    expect(screen.queryByText(/five star|5-star|leave a \d/i)).not.toBeInTheDocument()
    expect(screen.getByText(/never affected by a review/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing is filled in or posted automatically/i)).toBeInTheDocument()
  })

  it('shreemanali shows exactly the clothing starters and never the jewellery ones', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreemanali"
      />,
    )
    const prompts = suggestionButtons().map((b) => (b.textContent ?? '').trim())
    expect(prompts).toEqual([
      'The service was warm and helpful throughout my visit.',
      'Loved the ethnic wear collection — so many beautiful options.',
      'They have a lovely range of sarees, kurtas and festive wear.',
      'The staff helped me pick the right outfit and the perfect size.',
      'The fabric and stitching quality of my outfit is excellent.',
      'The fitting of the ready-made garments was just right.',
      'The prices are fair for the quality you get.',
      'Shopping here was smooth and easy from start to finish.',
      'I found exactly what I needed for the occasion.',
      'My visit to the store was a really pleasant experience.',
    ])
    // The jewellery shop's recommendations never appear here.
    expect(screen.queryByText('I really liked the jewellery designs.')).toBeNull()
    expect(screen.queryByText('The staff helped me choose the right jewellery.')).toBeNull()
    expect(screen.queryByText('The collection had many beautiful options.')).toBeNull()
  })

  it('topic chips narrow the jewellery starters on the original topics', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreejwellers"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Quality' }))
    expect(suggestionButtons().map((b) => (b.textContent ?? '').trim())).toEqual([
      'Good quality and good service.',
      'Good value for the quality.',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Price' }))
    expect(suggestionButtons().map((b) => (b.textContent ?? '').trim())).toEqual([
      'Good value for the quality.',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(suggestionButtons()).toHaveLength(10)
  })

  it('topic chips narrow the clothing starters to the chosen topic', () => {
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreemanali"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Quality' }))
    expect(suggestionButtons().map((b) => (b.textContent ?? '').trim())).toEqual([
      'The fabric and stitching quality of my outfit is excellent.',
      'The fitting of the ready-made garments was just right.',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'My Visit' }))
    expect(suggestionButtons()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(suggestionButtons()).toHaveLength(10)
  })

  it('one tap on a card copies the text AND opens the Google review tab', async () => {
    openSpy.mockImplementation((url: string | URL | null) =>
      url === '' ? ({ close: () => {} } as unknown as Window) : null,
    )
    const onReviewed = vi.fn()
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        onReviewed={onReviewed}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreejwellers"
      />,
    )
    const [first] = suggestionButtons()
    fireEvent.click(first)

    // Highlighted card.
    expect(first).toHaveAttribute('aria-pressed', 'true')
    // The text is copied from the tap.
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(first.textContent?.trim())
      expect(screen.getByText(/Copied - paste it into your review/i)).toBeInTheDocument()
    })
    // The Google review tab opens from the same tap.
    expect(openSpy).toHaveBeenCalledWith('https://g.page/r/example', '_blank', 'noopener,noreferrer')
    expect(onReviewed).toHaveBeenCalledTimes(1)
  })

  it('keeps the text visible with manual-copy help when the tap copy fails, and still opens Google', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    openSpy.mockImplementation((url: string | URL | null) =>
      url === '' ? ({ close: () => {} } as unknown as Window) : null,
    )
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreejwellers"
      />,
    )
    const [first] = suggestionButtons()
    fireEvent.click(first)

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/select and copy the text manually/i)
    })
    // The chosen text stays available for a manual copy; "Copied" never shows.
    expect(screen.getByLabelText('Review text to copy')).toHaveValue(first.textContent?.trim())
    expect(screen.queryByText(/Copied - paste it/i)).not.toBeInTheDocument()
    // Google still opens - the customer is never stuck.
    expect(openSpy).toHaveBeenCalledWith('https://g.page/r/example', '_blank', 'noopener,noreferrer')
  })

  it('shows a popup-blocked fallback link without losing the flow', () => {
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
        storeSlug="shreejwellers"
      />,
    )
    fireEvent.click(suggestionButtons()[0])

    expect(screen.getByRole('alert')).toHaveTextContent(/blocked the new tab/i)
    expect(onReviewed).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Open Google Reviews' })).toHaveAttribute(
      'href',
      'https://g.page/r/example',
    )
  })

  it('copies but never opens anything when the shop has no review link (skippable)', () => {
    const onReviewed = vi.fn()
    const onSkip = vi.fn()
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={onSkip}
        onReviewed={onReviewed}
        reviewUrl={null}
        storeSlug="shreejwellers"
      />,
    )
    fireEvent.click(suggestionButtons()[0])
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(openSpy).not.toHaveBeenCalled()
    expect(onReviewed).not.toHaveBeenCalled()

    // The explicit footer ways onward still work.
    expect(screen.getByRole('button', { name: 'Open Google' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('never opens Google before the customer taps, and the footer re-open is explicit', async () => {
    openSpy.mockImplementation((url: string | URL | null) =>
      url === '' ? ({ close: () => {} } as unknown as Window) : null,
    )
    const onReviewed = vi.fn()
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        onReviewed={onReviewed}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreejwellers"
      />,
    )
    // Simply rendering the modal opens nothing.
    expect(openSpy).not.toHaveBeenCalled()
    expect(onReviewed).not.toHaveBeenCalled()

    // The footer action is an explicit, separate way to open Google.
    fireEvent.click(screen.getByRole('button', { name: 'Open Google' }))
    await vi.waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://g.page/r/example', '_blank', 'noopener,noreferrer')
    })
    expect(onReviewed).toHaveBeenCalledTimes(1)
    // Nothing claims a review was posted - only that Google is opening.
    expect(screen.queryByText(/review (was|is) (posted|submitted|published)/i)).not.toBeInTheDocument()
  })

  it('switching cards keeps every tap a fresh copy + open', async () => {
    openSpy.mockImplementation((url: string | URL | null) =>
      url === '' ? ({ close: () => {} } as unknown as Window) : null,
    )
    render(
      <GoogleReviewAssistant
        open
        onClose={noop}
        onSkip={noop}
        reviewUrl="https://g.page/r/example"
        storeSlug="shreejwellers"
      />,
    )
    const cards = suggestionButtons()
    fireEvent.click(cards[0])
    fireEvent.click(cards[3])
    expect(cards[3]).toHaveAttribute('aria-pressed', 'true')
    expect(cards[0]).toHaveAttribute('aria-pressed', 'false')
    expect(writeText).toHaveBeenNthCalledWith(1, cards[0].textContent?.trim())
    expect(writeText).toHaveBeenNthCalledWith(2, cards[3].textContent?.trim())
    // Each tap opens the Google tab once (the extra call per tap is the
    // short-lived block-detection probe).
    const googleOpens = openSpy.mock.calls.filter(([url]) => url === 'https://g.page/r/example')
    expect(googleOpens).toHaveLength(2)
    await vi.waitFor(() => {
      expect(screen.getByText(/Copied - paste it into your review/i)).toBeInTheDocument()
    })
  })
})
