import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ReflectorMark } from './ReflectorMark'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '@/auth/AuthContext'

type PublicShellProps = {
  title?: string
  crumb?: string[]
  children: ReactNode
}

/**
 * Chrome for anonymous/public views — no sidebar, slim header with the
 * Reflector mark, optional page title + crumb, theme toggle, and a
 * "Sign in" link for unauthenticated visitors.
 */
export function PublicShell({ title, crumb, children }: PublicShellProps) {
  const { authenticated } = useAuth()
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      <header
        style={{
          height: 65,
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
          fontFamily: 'var(--font-sans)',
          flexShrink: 0,
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: 'var(--fg)',
          }}
        >
          <ReflectorMark size={26} />
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            Reflector
          </span>
        </Link>

        {(title || (crumb && crumb.length > 0)) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              marginLeft: 18,
              paddingLeft: 18,
              borderLeft: '1px solid var(--border)',
              minWidth: 0,
            }}
          >
            {crumb && crumb.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {crumb.map((c, i) => (
                  <Fragment key={i}>
                    <span
                      style={{
                        color: i === crumb.length - 1 ? 'var(--fg)' : 'var(--fg-muted)',
                      }}
                    >
                      {c}
                    </span>
                    {i < crumb.length - 1 && (
                      <span style={{ color: 'var(--gh-grey-4)' }}>/</span>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
            {title && (
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.015em',
                  color: 'var(--fg)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <ThemeToggle />

        {!authenticated && (
          <Link
            to={`/login?redirect=${encodeURIComponent(
              typeof window !== 'undefined'
                ? window.location.pathname + window.location.search
                : '/',
            )}`}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg)',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            Sign in
          </Link>
        )}
      </header>

      <main
        style={{
          flex: 1,
          padding: '24px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </main>
    </div>
  )
}
