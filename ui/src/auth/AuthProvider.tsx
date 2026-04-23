import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AuthProvider as OidcAuthProvider,
  useAuth as useOidcAuth,
} from 'react-oidc-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, getPasswordToken, setPasswordToken, setOidcAccessTokenGetter } from '@/api/client'
import { AuthContext, type AuthContextValue, type AuthUser } from './AuthContext'
import { buildOidcConfig, oidcEnabled } from './oidcConfig'

function useMeQuery(tokenKey: string | null | undefined) {
  return useQuery<AuthUser>({
    queryKey: ['auth', 'me', tokenKey ?? 'anon'],
    enabled: !!tokenKey,
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/me')
      if (error || !response.ok) {
        if (response.status === 401) return null
        throw Object.assign(new Error('me request failed'), { status: response.status })
      }
      return (data ?? null) as AuthUser
    },
    staleTime: 60_000,
  })
}

function PasswordAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => getPasswordToken())
  const meQuery = useMeQuery(token)

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const detail = await res
          .json()
          .then((j: { detail?: string }) => j?.detail)
          .catch(() => null)
        throw new Error(detail ?? 'Invalid credentials')
      }
      const json = (await res.json()) as { access_token: string }
      setPasswordToken(json.access_token)
      setToken(json.access_token)
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    setPasswordToken(null)
    setToken(null)
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
  }, [queryClient])

  const loginWithOidc = useCallback(() => {
    console.warn('OIDC login not configured; use loginWithPassword')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: 'password',
      loading: meQuery.isLoading,
      authenticated: !!token && meQuery.data != null,
      user: meQuery.data ?? null,
      error: (meQuery.error as Error | null) ?? null,
      loginWithOidc,
      loginWithPassword,
      logout,
    }),
    [token, meQuery.isLoading, meQuery.data, meQuery.error, loginWithOidc, loginWithPassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function OidcAuthBridge({ children }: { children: ReactNode }) {
  const oidc = useOidcAuth()
  const queryClient = useQueryClient()
  const accessToken = oidc.user?.access_token ?? null

  useEffect(() => {
    setOidcAccessTokenGetter(() => accessToken)
    return () => setOidcAccessTokenGetter(null)
  }, [accessToken])

  const meQuery = useMeQuery(accessToken)

  const loginWithOidc = useCallback(() => oidc.signinRedirect(), [oidc])
  const loginWithPassword = useCallback(async () => {
    throw new Error('Password login is disabled in OIDC mode')
  }, [])
  const logout = useCallback(async () => {
    await oidc.signoutRedirect().catch(() => oidc.removeUser())
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
  }, [oidc, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: 'oidc',
      loading: oidc.isLoading || meQuery.isLoading,
      authenticated: !!accessToken && meQuery.data != null,
      user: meQuery.data ?? null,
      error: (oidc.error ?? (meQuery.error as Error | null)) ?? null,
      loginWithOidc,
      loginWithPassword,
      logout,
    }),
    [oidc.isLoading, oidc.error, accessToken, meQuery.isLoading, meQuery.data, meQuery.error, loginWithOidc, loginWithPassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = buildOidcConfig()
  if (!config || !oidcEnabled) {
    return <PasswordAuthProvider>{children}</PasswordAuthProvider>
  }
  return (
    <OidcAuthProvider {...config}>
      <OidcAuthBridge>{children}</OidcAuthBridge>
    </OidcAuthProvider>
  )
}
