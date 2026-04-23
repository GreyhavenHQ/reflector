import { createContext, useContext } from 'react'

export type AuthMode = 'oidc' | 'password'

export type AuthUser = {
  email?: string | null
  name?: string | null
  sub?: string | null
} | null

export type AuthContextValue = {
  mode: AuthMode
  loading: boolean
  authenticated: boolean
  user: AuthUser
  error: Error | null
  loginWithOidc: () => void
  loginWithPassword: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
