import { useDashboard } from './DashboardContext'
import { RewardsSection, TiersSection } from './StoreEditor'
import { PageHeader } from '@/components/saas/ui'

export default function GiftsPage() {
  const { store, reload } = useDashboard()
  if (!store) return null

  return (
    <div>
      <PageHeader
        title="Gifts & Rewards"
        description="Choose what each purchase amount earns, and how it appears on the wheel."
      />
      <div className="flex flex-col gap-8">
        <RewardsSection store={store} onSaved={reload} />
        <TiersSection store={store} onSaved={reload} />
      </div>
    </div>
  )
}
