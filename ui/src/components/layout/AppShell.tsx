import { type ReactNode } from 'react'
import { TopBar } from './TopBar'

type AppShellProps = {
  title: string
  crumb?: string[]
  sidebar?: ReactNode
  children: ReactNode
}

export function AppShell({ title, crumb, sidebar, children }: AppShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {sidebar}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={title} crumb={crumb} />
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            background: 'var(--bg)',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
