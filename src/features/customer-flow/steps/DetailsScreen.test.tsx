import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useCustomerFlow } from '../store'
import { StoreConfigProvider } from '../StoreContext'
import { DetailsScreen } from './DetailsScreen'
import { JOLLY_ENTERPRISES, JOLLY_ENTERPRISES_SLUG } from '../../../lib/stores'
import { DataProviderProvider } from '../../../providers/DataProviderContext'
import { LocalDataProvider } from '../../../lib/data/local'

/**
 * Optional invoice details on the customer form:
 * - the field is offered on the shared customer form (every store link),
 * - it is explicitly optional: the entry submits with or without it,
 * - it never gates the reward (validation of required fields is unchanged).
 */

const provider = new LocalDataProvider()
const createSubmission = vi.spyOn(provider, 'createSubmission')

function renderScreen(): void {
  render(
    <DataProviderProvider provider={provider}>
      <StoreConfigProvider store={JOLLY_ENTERPRISES}>
        <DetailsScreen />
      </StoreConfigProvider>
    </DataProviderProvider>,
  )
}

function fillRequired(): void {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Customer' } })
  fireEvent.change(screen.getByLabelText('Purchase amount in Indian Rupees'), {
    target: { value: '125000' },
  })
  fireEvent.change(screen.getByLabelText('10-digit mobile number'), {
    target: { value: '9876543210' },
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  createSubmission.mockClear()
  // The provider spy stays attached across tests (only its call history is
  // cleared here); vi.restoreAllMocks() would detach it from the instance.
  act(() => {
    useCustomerFlow.setState({
      step: 'DETAILS',
      slug: JOLLY_ENTERPRISES_SLUG,
      fullName: '',
      purchaseAmount: null,
      phoneNumber: '',
      invoiceDetails: '',
      submissionRequestId: '11111111-2222-4333-8444-555555555555',
      submissionId: null,
      claimCode: null,
      rewardResult: null,
      spinStatus: 'idle',
      currentRotation: 0,
      hasSpun: false,
      reviewReturnDetected: false,
    })
  })
})

describe('DetailsScreen optional invoice details', () => {
  it('offers an optional invoice-details field marked as optional', () => {
    renderScreen()
    const field = screen.getByLabelText('Invoice details (optional)')
    expect(field).toBeTruthy()
    expect(screen.getByText(/optional — you can continue and receive your reward without it/i)).toBeTruthy()
  })

  it('submits the entry without invoice details (not a reward condition)', async () => {
    renderScreen()
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    await waitFor(() => expect(createSubmission).toHaveBeenCalledTimes(1))
    expect(createSubmission.mock.calls[0][0]).toMatchObject({
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      purchaseAmount: 125000,
      invoiceDetails: null,
    })
    await waitFor(() => expect(useCustomerFlow.getState().step).toBe('REVIEW_INVITATION'))
    expect(useCustomerFlow.getState().submissionId).not.toBeNull()
  })

  it('passes invoice details through with the submission when provided', async () => {
    renderScreen()
    fillRequired()
    fireEvent.change(screen.getByLabelText('Invoice details (optional)'), {
      target: { value: '  INV-2026-00123  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    await waitFor(() => expect(createSubmission).toHaveBeenCalledTimes(1))
    expect(createSubmission.mock.calls[0][0]).toMatchObject({ invoiceDetails: 'INV-2026-00123' })
  })

  it('still blocks submission when required fields are missing', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    expect(createSubmission).not.toHaveBeenCalled()
    expect(screen.getByText(/please enter your name/i)).toBeTruthy()
    expect(screen.getByText(/please enter your purchase amount/i)).toBeTruthy()
  })
})
