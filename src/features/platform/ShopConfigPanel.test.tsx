import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShopConfigPanel } from './ShopConfigPanel'
import { getCampaignUrl } from '../../lib/qr'
import type { ShopRow } from './api'

/**
 * Platform shop-configuration surface, pinned against the real component:
 * the clearly labelled Google Review Link panel (https-only validation, save,
 * remove, configured indicator, open-to-verify destination), the platform
 * owner-editability switch, share links, and honest setup-pending markers.
 * Server-side enforcement (https CHECK + guard trigger + RPCs) is tested
 * against the real database in scripts/backend-e2e.mjs.
 */

const mocks = vi.hoisted(() => ({
  saveStoreReviewLink: vi.fn(),
  setStoreReviewPolicy: vi.fn(),
  renameStoreSlug: vi.fn(),
  updateShopBranding: vi.fn(),
  updateShopLogo: vi.fn(),
}))

vi.mock('../../lib/data', () => ({ getSupabaseClient: () => ({ __stub: true }) }))
vi.mock('./api', () => ({
  saveStoreReviewLink: mocks.saveStoreReviewLink,
  setStoreReviewPolicy: mocks.setStoreReviewPolicy,
  renameStoreSlug: mocks.renameStoreSlug,
  updateShopBranding: mocks.updateShopBranding,
  updateShopLogo: mocks.updateShopLogo,
}))

const shop = (extra: Partial<ShopRow> = {}): ShopRow => ({
  id: 'store-1',
  slug: 'kohinoor',
  name: 'Kohinoor',
  status: 'active',
  active: true,
  minSpinAmount: 1000,
  logoUrl: null,
  subtitle: null,
  primaryColor: null,
  secondaryColor: null,
  campaignBadge: null,
  googleReviewUrl: null,
  reviewLinkOwnerEditable: true,
  ownerEmail: null,
  ownerStatus: null,
  createdAt: '2026-10-17T00:00:00Z',
  ...extra,
})

describe('ShopConfigPanel review-link panel', () => {
  const onNotice = vi.fn()
  const onError = vi.fn()
  const onChanged = vi.fn()

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset().mockResolvedValue(undefined))
    onNotice.mockReset()
    onError.mockReset()
    onChanged.mockReset()
  })

  const renderPanel = (s: ShopRow) =>
    render(
      <ShopConfigPanel
        shop={s}
        onChanged={onChanged}
        onNotice={onNotice}
        onError={onError}
      />,
    )

  it('shows honest setup-pending markers when owner or review link are missing', () => {
    renderPanel(shop())
    expect(screen.getByText(/Setup pending · no owner account linked/)).toBeInTheDocument()
    expect(screen.getByText(/Setup pending · review link not configured/)).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
  })

  it('shows the configured destination with an open-to-verify link', () => {
    const url = 'https://search.google.com/local/writereview?placeid=abc'
    renderPanel(shop({ googleReviewUrl: url, ownerStatus: 'linked', ownerEmail: 'a@b.co' }))
    expect(screen.getByText('Configured')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: url }) as HTMLAnchorElement
    expect(link.href).toBe(url)
    expect(link.target).toBe('_blank')
    expect(screen.queryByText(/Setup pending/)).toBeNull()
  })

  it('rejects a non-https URL visibly and never saves it', async () => {
    renderPanel(shop({ ownerStatus: 'linked', ownerEmail: 'a@b.co' }))
    fireEvent.change(screen.getByPlaceholderText(/writereview/), {
      target: { value: 'http://google.com/review' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/https:\/\//)
    const saveButton = screen.getByRole('button', { name: 'Save review link' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(mocks.saveStoreReviewLink).not.toHaveBeenCalled()
  })

  it('saves a valid https link for this shop only', async () => {
    const url = 'https://www.google.com/maps/place/?q=placeid:xyz'
    renderPanel(shop({ ownerStatus: 'linked', ownerEmail: 'a@b.co' }))
    fireEvent.change(screen.getByPlaceholderText(/writereview/), { target: { value: url } })
    fireEvent.click(screen.getByRole('button', { name: 'Save review link' }))
    await waitFor(() =>
      expect(mocks.saveStoreReviewLink).toHaveBeenCalledWith(expect.anything(), 'store-1', url),
    )
    expect(mocks.setStoreReviewPolicy).not.toHaveBeenCalled()
  })

  it('removes the link with the explicit remove action', async () => {
    const url = 'https://search.google.com/local/writereview?placeid=abc'
    renderPanel(shop({ googleReviewUrl: url, ownerStatus: 'linked', ownerEmail: 'a@b.co' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }))
    await waitFor(() =>
      expect(mocks.saveStoreReviewLink).toHaveBeenCalledWith(expect.anything(), 'store-1', null),
    )
  })

  it('gates owner editing through the platform switch', async () => {
    renderPanel(shop({ ownerStatus: 'linked', ownerEmail: 'a@b.co' }))
    const toggle = screen.getByRole('checkbox')
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(mocks.setStoreReviewPolicy).toHaveBeenCalledWith(expect.anything(), 'store-1', false),
    )
  })

  it('exposes the customer page and shop login links', () => {
    renderPanel(shop())
    const customer = getCampaignUrl('kohinoor')
    const login = `${customer}/admin`
    expect(screen.getByRole('link', { name: customer })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: login })).toBeInTheDocument()
  })

  it('saves branding edits through the platform API', async () => {
    renderPanel(shop({ ownerStatus: 'linked', ownerEmail: 'a@b.co' }))
    fireEvent.change(screen.getByLabelText('Shop name'), { target: { value: 'Kohinoor Art' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save branding' }))
    await waitFor(() =>
      expect(mocks.updateShopBranding).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        expect.objectContaining({ name: 'Kohinoor Art' }),
      ),
    )
  })
})
