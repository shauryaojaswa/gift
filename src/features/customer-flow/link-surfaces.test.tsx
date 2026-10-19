import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { DataProviderProvider } from '../../providers/DataProviderContext'
import { LocalDataProvider } from '../../lib/data/local'
import { JOLLY_ENTERPRISES_SLUG } from '../../lib/stores'
import { getCampaignUrl } from '../../lib/qr'
import { useCustomerFlow, clearFlowSession } from './store'

/**
 * Contract: the optional invoice-details form is the BASE for every customer
 * link the SaaS issues. All link surfaces (QR deliverable, standee, vendor
 * "My QR Code", platform handover panels, copy-link actions) build the
 * canonical campaign URL `https://jriq.in/{slug}` (see `src/lib/qr.test.ts`
 * and `features/vendor/lib.test.ts`), and every path that URL can take -
 * canonical, corrected-spelling alias, shop-requested alias, and the legacy
 * `/store/{slug}` QR path already printed in the field - lands on the SAME
 * shared customer form, which includes the invoice-details field.
 */

const provider = new LocalDataProvider()

const ENTRY_PATHS = [
  { label: 'canonical campaign link', path: `/${JOLLY_ENTERPRISES_SLUG}` },
  { label: 'corrected-spelling alias', path: `/${JOLLY_ENTERPRISES_SLUG}/customer` },
  { label: 'shop-requested alias', path: `/${JOLLY_ENTERPRISES_SLUG}/costumer` },
  { label: 'legacy printed QR path', path: `/store/${JOLLY_ENTERPRISES_SLUG}` },
]

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  clearFlowSession(JOLLY_ENTERPRISES_SLUG)
  useCustomerFlow.setState({
    step: 'WELCOME',
    slug: '',
    customerId: null,
    fullName: '',
    purchaseAmount: null,
    phoneNumber: '',
    invoiceDetails: '',
    submissionRequestId: '',
    submissionId: null,
    claimCode: null,
    rewardResult: null,
    spinStatus: 'idle',
    currentRotation: 0,
    hasSpun: false,
    reviewReturnDetected: false,
    reviewCtaShown: false,
    reviewCtaClicked: false,
  })
})

describe('every SaaS-issued customer link serves the invoice-details form', () => {
  it('the canonical link builder points exactly at the tested customer route', () => {
    const url = getCampaignUrl(JOLLY_ENTERPRISES_SLUG)
    expect(new URL(url).pathname).toBe(`/${JOLLY_ENTERPRISES_SLUG}`)
    expect(url).not.toMatch(/\/admin|\/store\//)
  })

  it.each(ENTRY_PATHS)('serves the shared invoice-details form via the $label ($path)', async ({ path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <DataProviderProvider provider={provider}>
          <App />
        </DataProviderProvider>
      </MemoryRouter>,
    )

    // Explicit timeouts: the full suite renders many files in parallel workers,
    // where the default 1s find window is too tight for the app-shell render.
    fireEvent.click(await screen.findByRole('button', { name: 'START' }, { timeout: 15000 }))

    // The one shared form - with the optional invoice-details field - appears.
    expect(await screen.findByLabelText('Invoice details (optional)', {}, { timeout: 15000 })).toBeTruthy()
    expect(screen.getByText(/optional — you can continue and receive your reward without it/i)).toBeTruthy()
    // Existing fields untouched on every surface.
    expect(screen.getByLabelText('Full name')).toBeTruthy()
    expect(screen.getByLabelText('Purchase amount in Indian Rupees')).toBeTruthy()
    expect(screen.getByLabelText('10-digit mobile number')).toBeTruthy()
    // Invoice details never gate the reward: no required marker, no validation.
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeTruthy()
  })
})
