import { useCustomerFlow } from '../store'

export function WelcomeScreen() {
  const setStep = useCustomerFlow((s) => s.setStep)

  return (
    <div className="flex flex-col items-center text-center gap-5">
      <h1 className="font-display text-3xl font-bold text-ink text-balance">
        YOUR REWARD IS WAITING
      </h1>
      <p className="font-body text-balance text-center text-muted max-w-sm">
        Enter a few details and discover your special reward.
      </p>
      <button type="button" className="btn-primary w-full mt-2" onClick={() => setStep('DETAILS')}>
        START
      </button>
      <p className="font-body text-xs text-muted">
        Takes less than 60 seconds · Quick &amp; simple · Spin &amp; Win
      </p>
    </div>
  )
}
