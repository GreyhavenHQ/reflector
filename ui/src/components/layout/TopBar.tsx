import { Fragment } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'

type TopBarProps = {
  title: string
  crumb?: string[]
}

export function TopBar({ title, crumb }: TopBarProps) {
  return (
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          alignSelf: 'flex-end',
          paddingBottom: 10,
          flexShrink: 0,
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--fg)',
            }}
          >
            {title}
          </h1>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <Button variant="ghost" size="icon" title="Notifications">
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          {I.Bell(16)}
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: 'var(--primary)',
              border: '1.5px solid var(--card)',
            }}
          />
        </span>
      </Button>
    </header>
  )
}
