import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { useNavigate } from 'react-router-dom'

export default function Privacy() {
  const navigate = useNavigate()

  return (
    <Card className="mt-4">
      <CardHeader>
        <h1 className="font-display text-2xl font-bold text-center text-ink">Privacy Policy</h1>
      </CardHeader>
      <CardBody className="prose prose-sm text-muted">
        <p className="font-body">
          This policy describes how the participating jewellery store collects and uses information
          in connection with the in-showroom customer feedback &amp; loyalty experience.
        </p>
        <h2 className="font-display text-lg text-ink">What we collect</h2>
        <ul className="font-body">
          <li><strong>Full name</strong> — used solely to identify your response and personalise your reward.</li>
          <li><strong>Purchase amount</strong> — determines your reward tier. Reward eligibility is based only on this amount.</li>
          <li><strong>Phone number</strong> — kept with your reward record and used only if required to contact you about your reward.</li>
        </ul>
        <h2 className="font-display text-lg text-ink">Google Reviews</h2>
        <p className="font-body">
          Leaving a Google Review is <strong>completely optional</strong>. Your reward is calculated solely from
          your purchase amount. If you choose to leave a review, this experience opens the store’s configured Google
          review page directly. We do not draft or submit reviews, and we do not collect review text, Google sign-in
          details, or a rating.
        </p>
        <h2 className="font-display text-lg text-ink">Marketing</h2>
        <p className="font-body">
          We do <strong>not</strong> automatically subscribe you to marketing. The customer experience does not collect
          marketing consent.
        </p>
        <h2 className="font-display text-lg text-ink">Data retention &amp; your rights</h2>
        <p className="font-body">
          Data is stored by the participating store for as long as necessary to provide your reward. You may request
          deletion of your data at any time by contacting the store with your phone number.
        </p>
        <h2 className="font-display text-lg text-ink">Contact</h2>
        <p className="font-body">
          Questions or data requests? Contact the jewellery store where you made your purchase.
        </p>
        <button type="button" className="btn-primary" onClick={() => navigate(-1)}>
          Back
        </button>
      </CardBody>
    </Card>
  )
}
