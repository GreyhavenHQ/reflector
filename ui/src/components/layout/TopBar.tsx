import { Fragment } from 'react'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

type TopBarProps = {
  title: string
  crumb?: string[]
}

export function TopBar({ title, crumb }: TopBarProps) {
  return (
    <header className="h-[65px] bg-card border-b border-border flex items-center px-6 gap-4 font-sans shrink-0">
      <div className="flex flex-col gap-px self-end pb-2.5 shrink-0">
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
        <div className="flex items-baseline gap-2.5">
          <h1 className="m-0 font-serif text-[22px] font-semibold tracking-[-0.02em] text-fg">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex-1" />

      <ThemeToggle />
    </header>
  )
}
