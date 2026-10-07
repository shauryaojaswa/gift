import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CurrencyInput } from './CurrencyInput'

describe('CurrencyInput', () => {
  it('formats 10000 as ₹10,000 (single rupee sign, Indian grouping)', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={10000} onChange={onChange} />)
    const input = await screen.findByDisplayValue('₹10,000')
    expect(input).toBeInTheDocument()
    // exactly one leading rupee sign
    const value = (input as HTMLInputElement).value
    expect(value.length - value.replace(/₹/g, '').length).toBe(1)
  })

  it('formats 125000 as ₹1,25,000 (Indian grouping, not Western)', async () => {
    render(<CurrencyInput value={125000} onChange={vi.fn()} />)
    await screen.findByDisplayValue('₹1,25,000')
    expect(screen.queryByDisplayValue('₹125,000')).not.toBeInTheDocument()
  })

  it('formats 1000000 as ₹10,00,000', async () => {
    render(<CurrencyInput value={1000000} onChange={vi.fn()} />)
    await screen.findByDisplayValue('₹10,00,000')
  })

  it('emits the numeric value on typed input', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={null} onChange={onChange} />)
    const input = await screen.findByPlaceholderText('₹10,000')
    fireEvent.change(input, { target: { value: '25000' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(25000))
  })

  it('parses a pasted formatted amount with rupee sign and commas', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={null} onChange={onChange} />)
    const input = await screen.findByPlaceholderText('₹10,000')
    fireEvent.change(input, { target: { value: '₹1,25,000' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(125000))
  })

  it('clears to null when emptied', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={125000} onChange={onChange} />)
    const input = await screen.findByDisplayValue('₹1,25,000')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
  })
})
