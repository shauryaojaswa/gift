import { createContext, useContext } from 'react'
import type { StoreConfig } from '@/types'

const StoreConfigContext = createContext<StoreConfig | null>(null)

export function StoreConfigProvider({
  store,
  children,
}: { store: StoreConfig | null; children: React.ReactNode }) {
  return <StoreConfigContext.Provider value={store}>{children}</StoreConfigContext.Provider>
}

export function useStoreConfigValue(): StoreConfig {
  const ctx = useContext(StoreConfigContext)
  if (!ctx) throw new Error('useStoreConfigValue must be used within StoreConfigProvider')
  return ctx
}
