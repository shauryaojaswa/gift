import { MarketingShell } from '@/components/saas/MarketingShell'

export default function Terms() {
  return (
    <MarketingShell>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Terms of Service</h1>
      <p className="mt-3 text-sm text-slate-500">These are the initial service terms for the Spin &amp; Win Rewards platform.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">1. The service</h2>
          <p className="mt-2">
            The platform provides a QR-based reward campaign for retail stores. Each store configures its own gifts,
            purchase tiers and branding, and is solely responsible for the campaign it publishes and for the gifts it
            promises and hands to its customers.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">2. Subscription and billing</h2>
          <p className="mt-2">
            Access is provided on a recurring subscription. A free trial is offered for the configured trial period.
            Paid plans renew automatically each billing period until cancelled. Prices and plan limits are set by the
            platform and shown on the pricing page. Failed payments may move a subscription into a past-due state; a
            grace period may apply before campaign access is restricted. Cancelling stops future renewals.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">3. Customer data</h2>
          <p className="mt-2">
            A store collects customer names, phone numbers and purchase amounts solely to operate its reward campaign.
            Each store's customer records are kept separate from every other store's and are never shared between
            tenants. The platform does not use this data for marketing on the store's behalf.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">4. Data retention and deletion</h2>
          <p className="mt-2">
            Customer records are retained for as long as needed to honour the store's rewards and to meet its own
            obligations. A customer may request deletion of their record by contacting the store. A store owner may
            export eligible data according to their plan, and may request deletion of their store and its data.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">5. Account termination</h2>
          <p className="mt-2">
            A store may be suspended or disabled for abuse, non-payment, or use that harms the platform or its users.
            On termination, records and configuration are retained for the configured retention period before deletion,
            unless a longer period is required by law.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">6. Responsibility for campaigns and gifts</h2>
          <p className="mt-2">
            The store is responsible for the accuracy of its reward configuration, for honouring the gifts it offers,
            and for ensuring its campaign complies with the law applicable to it. The platform provides the software
            only.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">7. No legal certification claimed</h2>
          <p className="mt-2">
            These terms are initial template terms. No independent legal review, certification or compliance
            accreditation is claimed for this document or for the platform.
          </p>
        </section>
      </div>
    </MarketingShell>
  )
}
