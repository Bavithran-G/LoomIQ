import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'

export type User = { id: number; username: string; full_name: string; role: string; buyer_id: number | null; buyer_name: string | null; is_active: boolean }
type Ctx = {
  user: User | null
  perms: Set<string>
  ready: boolean
  can: (p: string) => boolean
  login: (u: string, p: string) => Promise<User>
  logout: () => void
}
const AuthCtx = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const qc = useQueryClient()

  const logout = useCallback(() => {
    setToken(null); setUser(null); setPerms(new Set()); qc.clear()
  }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!getToken()) { setReady(true); return }
    api<{ user: User; permissions: string[] }>('/api/auth/me')
      .then((r) => { setUser(r.user); setPerms(new Set(r.permissions)) })
      .catch(() => setToken(null))
      .finally(() => setReady(true))
  }, [logout])

  const login = async (username: string, password: string) => {
    const form = new FormData()
    form.set('username', username)
    form.set('password', password)
    const r = await api<{ access_token: string; user: User; permissions: string[] }>('/api/auth/login', { form, auth: false })
    setToken(r.access_token)
    setUser(r.user)
    setPerms(new Set(r.permissions))
    return r.user
  }
  return (
    <AuthCtx.Provider value={{ user, perms, ready, can: (p) => perms.has(p), login, logout }}>{children}</AuthCtx.Provider>
  )
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth outside provider')
  return c
}
