import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { OwnerStore, SubscriptionSummary } from '@/types/saas'

interface DashboardValue {
  store: OwnerStore | null
  subscription: SubscriptionSummary | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const EMPTY: DashboardValue = {
  store: null,
  subscription: null,
  loading: true,
  error: null,
  reload: async () => {},
}

import { createContext, useContext } from 'react'

const DashboardContext = createContext<DashboardValue>(EMPTY)

export function DashboardProvider({ storeId, children }: { storeId: string | null; children: React.ReactNode }) {
  const [store, setStore] = useState<OwnerStore | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!storeId) {
      setLoading(false)
      return
    }
    try {
      const result = await api.getStore(storeId)
      setStore(result.store)
      setSubscription(result.subscription)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your store')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <DashboardContext.Provider value={{ store, subscription, loading, error, reload }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  return useContext(DashboardContext)
}
