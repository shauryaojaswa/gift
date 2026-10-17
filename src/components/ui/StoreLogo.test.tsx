import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('renders inside a dimensionally stable box that never changes with the logo state', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/store-logos/abc/logo.png'
    const { container, rerender } = render(<StoreLogo logoUrl={url} name="Shree Jewellers" />)
    const boxOf = () => container.firstElementChild as HTMLElement
    // With a logo: the fixed box is present and the image is contained inside it.
    expect(boxOf().className).toContain('store-logo-box')
    expect(boxOf().className).toContain('h-[180px]')
    expect(boxOf().className).toContain('w-[180px]')
    const img = screen.getByRole('img', { name: 'Shree Jewellers' })
    expect(img.parentElement).toBe(boxOf())
    expect(img.className).toContain('object-contain')
    // Swapping to the fallback keeps the SAME box element and dimensions.
    rerender(<StoreLogo logoUrl={null} name="Shree Jewellers" />)
    expect(boxOf().className).toContain('store-logo-box')
    expect(boxOf().className).toContain('h-[180px]')
    expect(boxOf().className).toContain('w-[180px]')
    expect(screen.getByRole('img', { name: 'Shree Jewellers logo' }).parentElement).toBe(boxOf())
    // And back to a logo again: still the same stable box.
    rerender(<StoreLogo logoUrl={url} name="Shree Jewellers" />)
    expect(boxOf().className).toContain('store-logo-box')
    expect(boxOf().className).toContain('h-[180px]')
    expect(boxOf().className).toContain('w-[180px]')
  })

  it('has a fixed width AND height for every responsive logo box in app.css', () => {
    // Read the stylesheet directly (same pattern as slugs.test.ts): every rule
    // that sizes .store-logo-box must set equal width and height so the logo
    // area can never shift when a logo loads or is swapped.
    const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8')
    const blocks = [...css.matchAll(/\.store-logo-box\s*\{([^}]*)\}/g)]
    expect(blocks.length).toBeGreaterThanOrEqual(4)
    for (const [, body] of blocks) {
      const width = /width:\s*(\d+)px/.exec(body ?? '')?.[1]
      const height = /height:\s*(\d+)px/.exec(body ?? '')?.[1]
      expect(width, `width missing in .store-logo-box block: ${body}`).toBeTruthy()
      expect(height, `height missing in .store-logo-box block: ${body}`).toBeTruthy()
      expect(width).toBe(height)
    }
  })
})
