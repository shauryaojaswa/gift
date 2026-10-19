import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { GiftColumnsPanel } from './GiftColumnsPanel'
import type { DataProvider } from '../../lib/data/types'
import type { GiftColumnsConfig, StoreConfig } from '../../types'

// The eight gift fields are the owner's only prize editor for gift-columns
// shops: partial drafts save with "N of 8 gifts configured" + missing fields,
// and publishing is blocked until all 8 fields hold a real name.

function mockProps(overrides: {
  giftColumns?: GiftColumnsConfig | null
  provider?: Partial<DataProvider>
}) {
  const dataProvider = {
    saveGiftColumns: vi.fn(async (draft: string[]) => ({
      draft,
      published: null,
      publishedAt: null,
    })),
    ...overrides.provider,
  } as unknown as DataProvider
  const store = {
    id: 'store-1',
    rewards: [],
    tiers: [],
    giftColumns: overrides.giftColumns ?? {
      draft: ['', '', '', '', '', '', '', ''],
      published: null,
      publishedAt: null,
    },
  } as unknown as StoreConfig
  return { store, dataProvider, reload: vi.fn() }
}

function typeField(container: HTMLElement, index: number, value: string) {
  const input = container.querySelectorAll('input')[index]
  fireEvent.change(input, { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GiftColumnsPanel', () => {
  it('starts with 8 blank fields and reports "0 of 8" with every field missing', () => {
    const props = mockProps({})
    const { container, getByText } = render(<GiftColumnsPanel {...props} />)
    expect(container.querySelectorAll('input')).toHaveLength(8)
    expect(getByText('0 of 8 gifts configured')).toBeTruthy()
    expect(getByText(/still needed: gift 1, gift 2, gift 3, gift 4, gift 5, gift 6, gift 7, gift 8/)).toBeTruthy()
  })

  it('hydrates the saved draft from the store on mount', () => {
    // Regression: the panel must show what the owner saved on the server (it is
    // mounted only after the store has loaded, so the store is authoritative).
    const props = mockProps({
      giftColumns: {
        draft: ['Gold Coin', 'Silver Coin', 'Diamond Pendant', '', '', '', '', ''],
        published: null,
        publishedAt: null,
      },
    })
    const { container, getByText } = render(<GiftColumnsPanel {...props} />)
    const inputs = container.querySelectorAll('input')
    expect((inputs[0] as HTMLInputElement).value).toBe('Gold Coin')
    expect((inputs[2] as HTMLInputElement).value).toBe('Diamond Pendant')
    expect((inputs[3] as HTMLInputElement).value).toBe('')
    expect(getByText('3 of 8 gifts configured')).toBeTruthy()
    expect(getByText(/still needed: gift 4, gift 5, gift 6, gift 7, gift 8/)).toBeTruthy()
  })

  it('saves a partial draft without publishing and reports the count', async () => {
    const props = mockProps({})
    const { container, getByRole, getByText } = render(<GiftColumnsPanel {...props} />)

    typeField(container, 0, '  Gold Coin  ')
    typeField(container, 2, 'Diamond Pendant')
    fireEvent.click(getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(props.dataProvider.saveGiftColumns).toHaveBeenCalledTimes(1))
    const [draft, publish] = vi.mocked(props.dataProvider.saveGiftColumns).mock.calls[0]
    expect(publish).toBe(false)
    // Trimmed on save; blank fields stay blank - nothing invented.
    expect(draft).toEqual(['Gold Coin', '', 'Diamond Pendant', '', '', '', '', ''])
    await waitFor(() => expect(getByText('2 of 8 gifts configured')).toBeTruthy())
  })

  it('blocks publishing at 0, 1 and 7 filled fields and lists the missing ones', async () => {
    const props = mockProps({})
    const { container, getByRole, getByText } = render(<GiftColumnsPanel {...props} />)
    const publishBtn = getByRole('button', { name: 'Publish gifts' }) as HTMLButtonElement

    expect(publishBtn.disabled).toBe(true) // 0 of 8

    typeField(container, 0, 'Gold Coin')
    expect((getByRole('button', { name: 'Publish gifts' }) as HTMLButtonElement).disabled).toBe(true) // 1 of 8
    expect(getByText(/still needed: gift 2, gift 3, gift 4, gift 5, gift 6, gift 7, gift 8/)).toBeTruthy()

    for (let i = 1; i <= 6; i += 1) typeField(container, i, `Gift ${i + 1}`)
    expect((getByRole('button', { name: 'Publish gifts' }) as HTMLButtonElement).disabled).toBe(true) // 7 of 8
    expect(getByText(/still needed: gift 8/)).toBeTruthy()

    expect(props.dataProvider.saveGiftColumns).not.toHaveBeenCalled()
  })

  it('treats whitespace-only fields as empty - publishing stays blocked', () => {
    const props = mockProps({})
    const { container, getByRole } = render(<GiftColumnsPanel {...props} />)
    for (let i = 0; i < 8; i += 1) typeField(container, i, '   ')
    expect((getByRole('button', { name: 'Publish gifts' }) as HTMLButtonElement).disabled).toBe(true)
    expect((getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('publishes all 8 fields in one step when every field is filled', async () => {
    const props = mockProps({})
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { container, getByRole } = render(<GiftColumnsPanel {...props} />)
    for (let i = 0; i < 8; i += 1) typeField(container, i, `Gift ${i + 1}`)

    fireEvent.click(getByRole('button', { name: 'Publish gifts' }))
    await waitFor(() => expect(props.dataProvider.saveGiftColumns).toHaveBeenCalledTimes(1))
    const [draft, publish] = vi.mocked(props.dataProvider.saveGiftColumns).mock.calls[0]
    expect(publish).toBe(true)
    expect(draft).toEqual(Array.from({ length: 8 }, (_, i) => `Gift ${i + 1}`))
    vi.unstubAllGlobals()
  })

  it('shows the delivered never-published state', () => {
    const props = mockProps({})
    const { getByText } = render(<GiftColumnsPanel {...props} />)
    expect(getByText(/Not published yet/)).toBeTruthy()
    expect(getByText(/REWARDS ARE BEING SET UP/)).toBeTruthy()
  })
})
