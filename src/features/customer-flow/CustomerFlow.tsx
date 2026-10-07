import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useCustomerFlow } from './store'
import { useStoreConfig } from '@/providers/DataProviderContext'
import { StoreLogo } from '@/components/ui/StoreLogo'
import { ProgressIndicator } from '@/components/ui/ProgressIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card'
import { WelcomeScreen } from './steps/WelcomeScreen'
import { DetailsScreen } from './steps/DetailsScreen'
import { ReviewInvitationScreen } from './steps/ReviewInvitationScreen'
import { SpinWinScreen } from './steps/SpinWinScreen'
import { RewardScreen } from './steps/RewardScreen'
import { ThankYouScreen } from './steps/ThankYouScreen'
import { StoreConfigProvider } from './StoreContext'
import type { FlowState } from '@/types'

function StepRenderer({ step }: { step: FlowState }) {
  switch (step) {
    case 'WELCOME':
      return <WelcomeScreen />
    case 'DETAILS':
      return <DetailsScreen />
    case 'REVIEW_INVITATION':
      return <ReviewInvitationScreen />
    case 'SPIN':
    case 'SPINNING':
      return <SpinWinScreen />
    case 'REWARD':
      return <RewardScreen />
    case 'THANK_YOU':
      return <ThankYouScreen />
    default:
      return <WelcomeScreen />
  }
}

export default function CustomerFlow() {
  const { slug = 'jolly-enterprises' } = useParams<{ slug: string }>()
  const { store, loading, error } = useStoreConfig(slug)
  const flow = useCustomerFlow((s) => s.step)
  const flowSlug = useCustomerFlow((s) => s.slug)
  const initFlow = useCustomerFlow((s) => s.init)

  useEffect(() => {
    document.title = 'Customer Rewards - Spin & Win'
  }, [])

  useEffect(() => {
    initFlow(slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    )
  }

  if (error || !store) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <h1 className="font-display text-center text-xl">Store not found</h1>
        </CardHeader>
        <CardBody>
          <p className="text-center text-muted">
            {error ?? `No store configured for "${slug}".`}
          </p>
          <button type="button" onClick={() => (window.location.href = '/')} className="mt-4 w-full btn-primary">
            Return home
          </button>
        </CardBody>
      </Card>
    )
  }

  if (flowSlug !== slug) {
    return (
      <div className="w-full max-w-md mx-auto flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    )
  }

  return (
    <Card
      className={`customer-flow-card mt-4 ${flow === 'SPIN' || flow === 'SPINNING' ? 'customer-flow-spin' : ''}`}
      style={{
        '--brand': store.primaryColor,
        '--brand-hover': store.primaryColor,
        '--secondary': store.secondaryColor,
      } as CSSProperties}
    >
      <CardHeader className="customer-flow-header">
        <StoreLogo logoUrl={store.logoUrl} />
        <div className="flex flex-col items-center mt-2">
          {store.subtitle && (
            <span className="font-body font-medium uppercase tracking-[0.15em] text-muted text-xs">
              {store.subtitle}
            </span>
          )}
          {store.campaignBadge && (
            <span className="mt-1 inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
              {store.campaignBadge}
            </span>
          )}
        </div>
      </CardHeader>

      <div className="customer-flow-progress px-6 pb-3">
        {flow !== 'WELCOME' && flow !== 'THANK_YOU' && flow !== 'COMPLETE' ? (
          <ProgressIndicator step={flow} />
        ) : null}
      </div>

      <CardBody>
        <StoreConfigProvider store={store}>
          <div key={flow} className="step-enter">
            <StepRenderer step={flow} />
          </div>
        </StoreConfigProvider>
      </CardBody>
      <CardFooter>
        {flow === 'WELCOME' && (
          <p className="text-center text-xs text-muted">
            Takes less than 60 seconds · Quick &amp; simple · Spin &amp; Win
          </p>
        )}
      </CardFooter>
    </Card>
  )
}
