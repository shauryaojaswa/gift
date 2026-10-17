import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoreLogo } from './StoreLogo'
import { monogram } from './LogoFallback'

describe('monogram', () => {
  it('uses first + last initials for multi-word names', () => {
    expect(monogram('Shree Jewellers')).toBe('SJ')
    expect(monogram('Jolly Enterprises')).toBe('JE')
    expect(monogram('  A  B  C  ')).toBe('AC')
  })

  it('handles single-word, empty and missing names', () => {
    expect(monogram('jriq')).toBe('JR')
    expect(monogram('')).toBe('★')
    expect(monogram(null)).toBe('★')
    expect(monogram(undefined)).toBe('★')
  })
})

describe('StoreLogo', () => {
  it('renders the monogram fallback when there is no logo', () => {
    render(<StoreLogo logoUrl={null} name="Shree Jewellers" />)
    const fallback = screen.getByRole('img', { name: 'Shree Jewellers logo' })
    expect(fallback).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Store logo' })).not.toBeInTheDocument()
  })

  it('treats the neutral placeholder asset as no logo', () => {
    render(<StoreLogo logoUrl="https://cdn.example.com/logo-placeholder.svg" name="Shree Jewellers" />)
    expect(screen.getByRole('img', { name: 'Shree Jewellers logo' })).toBeInTheDocument()
  })

  it('renders a real logo without cropping (object-contain)', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/store-logos/abc/logo.png'
    render(<StoreLogo logoUrl={url} name="Shree Jewellers" />)
    const img = screen.getByRole('img', { name: 'Shree Jewellers' }) as HTMLImageElement
    expect(img.src).toBe(url)
    expect(img.className).toContain('object-contain')
  })

  it('falls back to the monogram when the logo fails to load', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/store-logos/abc/gone.png'
    render(<StoreLogo logoUrl={url} name="Shree Jewellers" />)
    const img = screen.getByRole('img', { name: 'Shree Jewellers' })
    fireEvent.error(img)
    expect(screen.getByRole('img', { name: 'Shree Jewellers logo' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Shree Jewellers' })).not.toBeInTheDocument()
  })

  it('keeps each shop on its own fallback when the logo URL changes', () => {
    const first = 'https://example.com/first.png'
    const second = 'https://example.com/second.png'
    const { rerender } = render(<StoreLogo logoUrl={first} name="Shree Jewellers" />)
    fireEvent.error(screen.getByRole('img', { name: 'Shree Jewellers' }))
    // The URL changed before the failure could be "carried over".
    rerender(<StoreLogo logoUrl={second} name="Jolly Enterprises" />)
    const img = screen.getByRole('img', { name: 'Jolly Enterprises' }) as HTMLImageElement
    expect(img.src).toBe(second)
  })
})
