import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReviewInvitationScreen } from './ReviewInvitationScreen'
import { StoreConfigProvider } from '../StoreContext'
import { useCustomerFlow } from '../store'
import { JOLLY_ENTERPRISES } from '../../../lib/stores'

describe('optional Google review step', () => {
  it('shows review invitation and allows skipping', () => {
    const store = {
      ...JOLLY_ENTERPRISES,
      googleReviewUrl: 'https://search.google.com/local/writereview?placeid=store-specific',
    }
    useCustomerFlow.setState({
      ...useCustomerFlow.getState(),
      step: 'REVIEW_INVITATION',
      reviewCtaShown: false,
      reviewCtaClicked: false,
    })
    render(
      <StoreConfigProvider store={store}>
        <ReviewInvitationScreen />
      </StoreConfigProvider>,
    )

    expect(screen.getByRole('heading', { name: 'ENJOYED YOUR EXPERIENCE?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write a review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip & Spin' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(useCustomerFlow.getState().reviewCtaShown).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Skip & Spin' }))
    expect(useCustomerFlow.getState().step).toBe('SPIN')
  })

  it('keeps spinning available when the store has not configured a review URL', () => {
    const store = { ...JOLLY_ENTERPRISES, googleReviewUrl: null }
    useCustomerFlow.setState({ ...useCustomerFlow.getState(), step: 'REVIEW_INVITATION' })
    render(
      <StoreConfigProvider store={store}>
        <ReviewInvitationScreen />
      </StoreConfigProvider>,
    )
    expect(screen.getByRole('button', { name: 'Write a review' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Skip & Spin' })).toBeEnabled()
  })
})
