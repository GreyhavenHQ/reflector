import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ReflectorMark } from './ReflectorMark'
import { ThemeToggle } from './ThemeToggle'

type Props = {
  title?: string
  crumb?: string[]
  actions?: ReactNode
}

/**
 * Thin top strip for full-bleed pages (record / meeting embed / public share).
 * Reflector mark + optional breadcrumb + title, theme toggle, and an
 * `actions` slot for page-specific buttons (e.g. "Stop recording").
 */
export function MinimalHeader({ title, crumb, actions }: Props) {
  return (
    <header
      style={{
        height: 56,
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 14,
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
        <ReflectorMark size={24} />
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16,
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
            marginLeft: 14,
            paddingLeft: 14,
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
                fontSize: 15,
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

      {actions}
      <ThemeToggle />
    </header>
  )
}
