import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useCustomerFlow } from './store'
import { useStoreConfig } from '@/providers/DataProviderContext'
import NotFound from '@/features/not-found/NotFound'
import { StoreLogo } from '@/components/ui/StoreLogo'
import { buildShopTheme, hslToString } from '@/lib/theme'
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

export default function CustomerFlow({ slug }: { slug: string }) {
  const { store, loading, error } = useStoreConfig(slug)
  const flow = useCustomerFlow((s) => s.step)
  const flowSlug = useCustomerFlow((s) => s.slug)
  const initFlow = useCustomerFlow((s) => s.init)

  // Saved shop colors become the live UI theme (buttons, progress, badges,
  // forms, review modal, wheel chrome) via CSS custom properties.
  const theme = useMemo(
    () => buildShopTheme(store?.primaryColor, store?.secondaryColor),
    [store?.primaryColor, store?.secondaryColor],
  )
  const themeVars = useMemo(
    () =>
      ({
        '--brand-h': theme.primary.h.toFixed(1),
        '--brand-s': `${(theme.primary.s * 100).toFixed(1)}%`,
        '--brand-l': `${(theme.primary.l * 100).toFixed(1)}%`,
        '--brand': hslToString(theme.primary),
        '--brand-hover-h': theme.primaryHover.h.toFixed(1),
        '--brand-hover-s': `${(theme.primaryHover.s * 100).toFixed(1)}%`,
        '--brand-hover-l': `${(theme.primaryHover.l * 100).toFixed(1)}%`,
        '--brand-hover': hslToString(theme.primaryHover),
        '--secondary-h': theme.secondary.h.toFixed(1),
        '--secondary-s': `${(theme.secondary.s * 100).toFixed(1)}%`,
        '--secondary-l': `${(theme.secondary.l * 100).toFixed(1)}%`,
        '--secondary': hslToString(theme.secondary),
        '--on-brand': theme.onPrimary,
      }) as CSSProperties,
    [theme],
  )

  useEffect(() => {
    document.title = store ? `${store.name} · Spin & Win` : 'Customer Rewards · Spin & Win'
  }, [store?.name])

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
      <NotFound
        message={
          error
            ? error
            : `No shop is published at this address. If you scanned a QR code, check that the link is complete.`
        }
      />
    )
  }

  if (store.status !== 'active') {
    return (
      <Card className="mt-6">
        <CardHeader>
          <h1 className="font-display text-center text-xl">{store.name}</h1>
        </CardHeader>
        <CardBody>
          <p className="text-center text-muted">
            This campaign is not active right now. New entries are not being accepted — please ask
            the shop team when it reopens.
          </p>
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="mt-4 w-full btn-primary"
          >
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
      style={themeVars}
    >
      <CardHeader className="customer-flow-header">
        <StoreLogo logoUrl={store.logoUrl} alt={store.name} />
        <h1 className="mt-2 text-center font-display text-xl font-bold text-ink">{store.name}</h1>
        <div className="flex flex-col items-center mt-1">
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
            60 SECONDS &middot; SIMPLE &middot; REWARD
          </p>
        )}
      </CardFooter>
    </Card>
  )
}
