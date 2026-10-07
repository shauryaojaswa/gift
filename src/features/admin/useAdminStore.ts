import { useEffect, useState, useCallback } from 'react'
import type { StoreConfig } from '@/types'
import { useDataProvider } from '@/providers/DataProviderContext'
import { useAdminAuth } from './AdminContext'

const ADMIN_STORE_SLUG = 'jolly-enterprises'

export function useAdminStore() {
  const dataProvider = useDataProvider()
  const { session } = useAdminAuth()
  const [store, setStore] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const s = await dataProvider.getStoreConfig(ADMIN_STORE_SLUG)
      setStore(s)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load store')
    } finally {
      setLoading(false)
    }
  }, [dataProvider, session])

  useEffect(() => {
    load()
  }, [load])

  return { store, loading, error, reload: load, dataProvider, session }
}

export { ADMIN_STORE_SLUG }
