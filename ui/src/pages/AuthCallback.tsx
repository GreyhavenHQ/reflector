import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

export function AuthCallbackPage() {
  const { authenticated, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && authenticated) navigate('/', { replace: true })
  }, [authenticated, loading, navigate])

  return (
    <div className="h-screen grid place-items-center text-fg-muted font-sans">
      Signing you in…
    </div>
  )
}
