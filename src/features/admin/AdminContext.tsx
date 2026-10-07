import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { AdminSession } from '@/lib/data'
import { useDataProvider } from '@/providers/DataProviderContext'

interface AdminAuthContextValue {
  session: AdminSession | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const dataProvider = useDataProvider()
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const s = await dataProvider.getSession()
    setSession(s)
    setLoading(false)
  }, [dataProvider])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await dataProvider.signInAdmin(email, password)
      if (res.ok) await refresh()
      return res
    },
    [dataProvider, refresh],
  )

  const logout = useCallback(async () => {
    await dataProvider.signOut()
    setSession(null)
  }, [dataProvider])

  return (
    <AdminAuthContext.Provider value={{ session, loading, login, logout }}>{children}</AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
