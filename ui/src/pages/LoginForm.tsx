import { useState } from 'react'
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

  const inputClass =
    'w-full h-10 px-3 bg-bg border border-border rounded-md text-fg font-sans text-sm outline-none'

  return (
    <main className="max-w-[400px] mx-auto pt-[100px] px-6 pb-[60px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-[22px]">
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] m-0 leading-[1.1] text-fg">
          Log in
        </h1>

        {error && (
          <div
            role="alert"
            className="text-[13px] text-destructive bg-[color-mix(in_srgb,var(--destructive)_8%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_25%,transparent)] rounded-md px-3 py-2"
          >
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">
            Email <span className="text-destructive">*</span>
          </span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">
            Password <span className="text-destructive">*</span>
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className="w-full h-10"
        >
          {loading ? 'Signing in…' : 'Log in'}
        </Button>

        <button
          type="button"
          onClick={() => navigate('/welcome')}
          className="bg-transparent border-none text-fg-muted text-[13px] font-sans cursor-pointer text-center p-0"
        >
          ← Back
        </button>
      </form>
    </main>
  )
}
