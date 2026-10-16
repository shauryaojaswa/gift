import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Home from './Home'

/**
 * v1.1.0 Phase 1 pin: the platform homepage at "/" must be a real homepage and
 * must NEVER auto-redirect to a shop (the diagnosed v1.0.0 regression class).
 * The probe records every location the router settles on; a redirect would show
 * up as a second pathname here.
 */
const visited: string[] = []

function LocationProbe() {
  const location = useLocation()
  visited.push(location.pathname)
  return null
}

function renderHome() {
  visited.length = 0
  return render(
    <MemoryRouter initialEntries={['/']}>
      <LocationProbe />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<div data-testid="navigated-away">navigated away</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Let every scheduled effect/navigation settle before asserting. */
async function settle() {
  await waitFor(() => expect(visited.length).toBeGreaterThan(0))
  await new Promise((resolve) => setTimeout(resolve, 50))
}

describe('JRIQ platform homepage', () => {
  it('answers what JRIQ is and offers the platform entry point', async () => {
    renderHome()
    await settle()

    expect(screen.getByRole('heading', { name: 'JRIQ' })).toBeInTheDocument()
    expect(screen.getByText(/White-label spin/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'For jewellers' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Platform Admin/i })).toHaveAttribute(
      'href',
      '/platform/login',
    )
  })

  it('never auto-redirects to a shop — "/" stays "/"', async () => {
    renderHome()
    await settle()

    expect(new Set(visited)).toEqual(new Set(['/']))
    expect(screen.queryByTestId('navigated-away')).toBeNull()
  })

  it('links only to system surfaces — never to a shop or admin URL', async () => {
    renderHome()
    await settle()

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).toMatch(/^\/(platform\/login|vendor\/login|privacy)$/)
    }
    // No legacy customer path and no shop-coupled address anywhere on the page.
    const html = document.body.innerHTML
    expect(html).not.toContain('/store/')
    expect(html).not.toContain('jolly-enterprises')
    expect(html).not.toContain('/admin')
  })
})
