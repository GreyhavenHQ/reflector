import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, authenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--fg-muted)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/welcome" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
