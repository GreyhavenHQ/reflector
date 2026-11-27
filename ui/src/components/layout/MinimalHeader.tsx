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
    <header className="h-14 bg-card border-b border-border flex items-center px-5 gap-3.5 font-sans shrink-0">
      <Link to="/" className="flex items-center gap-2.5 no-underline text-fg">
        <ReflectorMark size={24} />
        <span className="font-serif text-base font-semibold tracking-[-0.01em]">
          Reflector
        </span>
      </Link>

      {(title || (crumb && crumb.length > 0)) && (
        <div className="flex flex-col gap-px ml-3.5 pl-3.5 border-l border-border min-w-0">
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
            <div className="font-serif text-[15px] font-semibold tracking-[-0.015em] text-fg whitespace-nowrap overflow-hidden text-ellipsis">
              {title}
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      {actions}
      <ThemeToggle />
    </header>
  )
}
