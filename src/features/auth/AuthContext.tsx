import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { AuthUser, Membership } from '@/types/saas'

interface AuthContextValue {
  user: AuthUser | null
  memberships: Membership[]
  isPlatformAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const session = await api.me()
      setUser(session.user)
      setMemberships(session.memberships)
      setIsPlatformAdmin(session.isPlatformAdmin)
    } catch {
      setUser(null)
      setMemberships([])
      setIsPlatformAdmin(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login({ email, password })
    setUser(session.user)
    setMemberships(session.memberships)
    setIsPlatformAdmin(session.isPlatformAdmin)
    setLoading(false)
  }, [])

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const session = await api.register({ email, password, fullName })
    setUser(session.user)
    setMemberships(session.memberships)
    setIsPlatformAdmin(session.isPlatformAdmin)
    setLoading(false)
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
    setMemberships([])
    setIsPlatformAdmin(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, memberships, isPlatformAdmin, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
