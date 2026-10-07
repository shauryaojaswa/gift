import { useState, useRef, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { formatINR, parseINRAmount } from '@/lib/currency'

export function CurrencyInput({
  value,
  onChange,
  placeholder = '₹10,000',
  id,
  autoFocus,
  onBlur,
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  id?: string
  autoFocus?: boolean
  onBlur?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internal, setInternal] = useState('')
  const focused = useRef(false)

  const fmt = (n: number | null): string => (n !== null && n > 0 ? formatINR(n) : '')

  useEffect(() => {
    if (!focused.current) setInternal(fmt(value))
  }, [value])

  const digitsBefore = (str: string, caret: number): number =>
    str.slice(0, caret).replace(/[^\d]/g, '').length

  const caretFor = (formatted: string, digitCount: number): number => {
    let count = 0
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) count++
      if (count === digitCount) return i + 1
    }
    return formatted.length
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const raw = el.value
    const caret = el.selectionStart ?? 0
    const digits = raw.replace(/[^\d]/g, '')
    const parsed = digits === '' ? null : parseINRAmount(digits)

    onChange(parsed)

    const before = digitsBefore(raw, caret)
    const formatted = fmt(parsed)
    setInternal(formatted)

    requestAnimationFrame(() => {
      const node = inputRef.current
      if (!node) return
      const pos = caretFor(formatted, before)
      node.setSelectionRange(pos, pos)
    })
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      className="field-input px-3 py-3 text-base"
      value={internal}
      onChange={handleChange}
      onFocus={() => {
        focused.current = true
        setInternal(fmt(value))
      }}
      onBlur={() => {
        focused.current = false
        const raw = inputRef.current?.value ?? ''
        const parsed = raw.replace(/[^\d]/g, '') === '' ? null : parseINRAmount(raw)
        onChange(parsed)
        setInternal(fmt(parsed))
        onBlur?.()
      }}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      autoFocus={autoFocus}
      aria-label="Purchase amount in Indian Rupees"
    />
  )
}
