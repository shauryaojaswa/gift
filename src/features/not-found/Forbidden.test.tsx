import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Forbidden from './Forbidden'

/**
 * The cross-shop 403 wall: a signed-in owner who opens another shop's admin
 * sees no shop data, gets a route to THEIR own dashboard, and - crucially -
 * can sign out to switch to the account that actually owns the shop in the
 * URL (without this they are stuck in a dead end).
 */
describe('Forbidden - cross-shop 403', () => {
  it('renders the ownership wall and links to the visitor\'s own shop', () => {
    render(
      <MemoryRouter>
        <Forbidden storeSlug="jolly-enterprises" />
      </MemoryRouter>,
    )
    expect(screen.getByText('This dashboard belongs to another shop')).toBeTruthy()
    expect(screen.getByText('Open my shop dashboard').getAttribute('href')).toBe(
      '/jolly-enterprises/admin/dashboard',
    )
  })

  it('offers a sign-out escape hatch when the visitor can sign out', () => {
    const onSignOut = vi.fn()
    render(
      <MemoryRouter>
        <Forbidden storeSlug="jolly-enterprises" onSignOut={onSignOut} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Sign out and use a different account/ }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows no sign-out button when no handler is supplied', () => {
    render(
      <MemoryRouter>
        <Forbidden storeSlug="jolly-enterprises" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull()
  })
})
