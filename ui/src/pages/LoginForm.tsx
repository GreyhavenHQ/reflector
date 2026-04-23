import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'
import { useAuth } from '@/auth/AuthContext'

export function LoginForm() {
  const { loginWithPassword } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      await loginWithPassword(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    height: 40,
    padding: '0 12px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    outline: 'none',
  }

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '100px 24px 60px' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.1,
            color: 'var(--fg)',
          }}
        >
          Log in
        </h1>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: 'var(--destructive)',
              background: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
            }}
          >
            {error}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
            Email <span style={{ color: 'var(--destructive)' }}>*</span>
          </span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
            Password <span style={{ color: 'var(--destructive)' }}>*</span>
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          style={{ width: '100%', height: 40 }}
        >
          {loading ? 'Signing in…' : 'Log in'}
        </Button>

        <button
          type="button"
          onClick={() => navigate('/welcome')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-muted)',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            textAlign: 'center',
            padding: 0,
          }}
        >
          ← Back
        </button>
      </form>
    </main>
  )
}
