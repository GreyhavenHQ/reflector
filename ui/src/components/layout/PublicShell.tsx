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
    <div className="flex flex-col min-h-screen bg-bg">
      <header className="h-[65px] bg-card border-b border-border flex items-center px-6 gap-4 font-sans shrink-0">
        <Link to="/" className="flex items-center gap-2.5 no-underline text-fg">
          <ReflectorMark size={26} />
          <span className="font-serif text-[17px] font-semibold tracking-[-0.01em]">
            Reflector
          </span>
        </Link>

        {(title || (crumb && crumb.length > 0)) && (
          <div className="flex flex-col gap-px ml-[18px] pl-[18px] border-l border-border min-w-0">
            {crumb && crumb.length > 0 && (
              <div className="text-[11px] text-fg-muted flex gap-1.5 items-center font-mono">
                {crumb.map((c, i) => (
                  <Fragment key={i}>
                    <span className={i === crumb.length - 1 ? 'text-fg' : 'text-fg-muted'}>
                      {c}
                    </span>
                    {i < crumb.length - 1 && (
                      <span className="text-[var(--gh-grey-4)]">/</span>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
            {title && (
              <div className="font-serif text-base font-semibold tracking-[-0.015em] text-fg whitespace-nowrap overflow-hidden text-ellipsis">
                {title}
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        <ThemeToggle />

        {!authenticated && (
          <Link
            to={`/login?redirect=${encodeURIComponent(
              typeof window !== 'undefined'
                ? window.location.pathname + window.location.search
                : '/',
            )}`}
            className="font-sans text-[13px] font-medium text-fg no-underline py-1.5 px-3 rounded-md border border-border bg-card shadow-xs"
          >
            Sign in
          </Link>
        )}
      </header>

      <main className="flex-1 p-6 w-full box-border">
        {children}
      </main>
    </div>
  )
}
