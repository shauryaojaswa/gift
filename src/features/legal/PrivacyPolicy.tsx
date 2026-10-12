import { MarketingShell } from '@/components/saas/MarketingShell'

export default function PrivacyPolicy() {
  return (
    <MarketingShell>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
      <p className="mt-3 text-sm text-slate-500">How customer information is handled across the platform.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">What is collected</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Full name</strong> — to identify the customer's reward entry.</li>
            <li><strong>Purchase amount</strong> — to determine which reward the customer has earned.</li>
            <li><strong>Phone number</strong> — kept with the reward record so the store can identify the customer at the counter.</li>
          </ul>
          <p className="mt-2">No email address, home address, date of birth or survey response is required.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Purpose limitation</h2>
          <p className="mt-2">
            Customer details are used only to operate the store's reward campaign: assigning a reward, producing a
            claim code, and tracking whether the gift was collected. They are not used for any other purpose.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Consent</h2>
          <p className="mt-2">
            Customers are not automatically subscribed to marketing. Marketing consent, where offered, is a separate
            optional choice.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Tenant separation</h2>
          <p className="mt-2">
            Each store's customer records are isolated from every other store's. A store cannot read, export or delete
            another store's customers, rewards, claims, configuration or billing details. Customer details are never
            reused across stores.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Public pages</h2>
          <p className="mt-2">
            Phone numbers are masked on public-facing confirmation screens, and full phone numbers are never placed in
            public reward links or QR parameters.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Retention and deletion requests</h2>
          <p className="mt-2">
            Records are retained only as long as needed to operate the campaign. A customer may request deletion of
            their record by contacting the store. A store owner may also request deletion of their store and its data.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Google reviews</h2>
          <p className="mt-2">
            Leaving a Google review is optional and independent of the reward. The platform does not write, preselect,
            or submit reviews, and does not claim a review was posted unless a legitimate verification mechanism exists.
          </p>
        </section>
      </div>
    </MarketingShell>
  )
}
