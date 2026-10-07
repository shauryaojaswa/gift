import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCustomerFlow } from '../store'
import { useStoreConfigValue } from '../StoreContext'
import { formatINR } from '@/lib/currency'
import { Confetti } from '@/components/ui/Confetti'
import { GoogleReviewAssistant } from '@/components/ui/GoogleReviewAssistant'

function maskPhone(value: string): string {
  if (!value) return '—'
  return value.replace(/\d(?=\d{4})/g, '*')
}

export function ThankYouScreen() {
  const store = useStoreConfigValue()
  const navigate = useNavigate()
  const {
    fullName,
    purchaseAmount,
    phoneNumber,
    rewardResult,
    submissionId,
    resetAll,
  } = useCustomerFlow((s) => ({
    fullName: s.fullName,
    purchaseAmount: s.purchaseAmount,
    phoneNumber: s.phoneNumber,
    rewardResult: s.rewardResult,
    submissionId: s.submissionId,
    resetAll: s.resetAll,
  }))

  const reward = rewardResult?.reward
  const code = useMemo(() => {
    if (!reward?.claimCodePrefix || !submissionId) return null
    return `${reward.claimCodePrefix}-${submissionId.slice(-6).toUpperCase()}`
  }, [reward?.claimCodePrefix, submissionId])

  return (
    <div className="flex flex-col items-center text-center gap-5">
      <Confetti active={false} />
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
        <svg width="32" height="20" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M5 10.5l5 5 9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-brand" />
      </div>
      <h2 className="font-display text-3xl font-bold text-ink">THANK YOU!</h2>
      <p className="font-body text-balance text-center text-muted max-w-sm">
        Your reward has been successfully unlocked.
      </p>

      <div className="w-full rounded-xl bg-ink/3 px-4 py-4 text-left">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Name</dt>
            <dd className="font-medium text-ink">{fullName || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Purchase Amount</dt>
            <dd className="font-medium text-ink">{purchaseAmount ? formatINR(purchaseAmount) : '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Reward</dt>
            <dd className="font-medium text-ink">{reward?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Phone</dt>
            <dd className="font-medium text-ink font-mono">{maskPhone(phoneNumber)}</dd>
          </div>
          {code && (
            <div className="flex justify-between">
              <dt className="text-muted">Claim Code</dt>
              <dd className="font-mono text-ink">{code}</dd>
            </div>
          )}
          {reward?.validityText && (
            <div className="flex justify-between">
              <dt className="text-muted">Validity</dt>
              <dd className="font-medium text-ink">{reward.validityText}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="flex flex-col gap-2 w-full pt-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            resetAll()
            navigate(`/store/${store.slug}`)
          }}
        >
          DONE
        </button>
        <GoogleReviewAssistant className="btn-ghost tap-target min-h-11 text-sm" />
        <button type="button" className="btn-ghost text-sm" onClick={() => resetAll()}>
          Submit another response
        </button>
      </div>

      <p className="font-body text-xs text-muted">
        Your reward is based only on your purchase amount.
      </p>
    </div>
  )
}