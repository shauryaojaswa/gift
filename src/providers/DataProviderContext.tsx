import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { StoreConfig } from '../types'
import type { DataProvider } from '../lib/data'
import { getDataProvider } from '../lib/data'

interface DataProviderContextValue {
  dataProvider: DataProvider
}

const DataProviderContext = createContext<DataProviderContextValue | null>(null)

export function DataProviderProvider({ children }: { children: React.ReactNode }) {
  const [dataProvider] = useState(() => getDataProvider())
  return (
    <DataProviderContext.Provider value={{ dataProvider }}>{children}</DataProviderContext.Provider>
  )
}

export function useDataProvider(): DataProvider {
  const ctx = useContext(DataProviderContext)
  if (!ctx) throw new Error('useDataProvider must be used within DataProviderProvider')
  return ctx.dataProvider
}

export interface StoreConfigState {
  store: StoreConfig | null
  loading: boolean
  error: string | null
}

export function useStoreConfig(slug: string): StoreConfigState & { reload: () => void } {
  const dataProvider = useDataProvider()
  const [state, setState] = useState<StoreConfigState>({ store: null, loading: true, error: null })

  const load = useCallback(() => {
    setState({ store: null, loading: true, error: null })
    dataProvider
      .getStoreConfig(slug)
      .then((store) => setState({ store, loading: false, error: store ? null : `Store "${slug}" not found` }))
      .catch((err: unknown) => setState({ store: null, loading: false, error: err instanceof Error ? err.message : 'Failed to load store' }))
  }, [dataProvider, slug])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(() => load(), [load])
  return { ...state, reload }
}
