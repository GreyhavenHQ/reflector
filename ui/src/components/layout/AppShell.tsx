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
    <div className="flex h-screen bg-bg overflow-hidden">
      {sidebar}
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} crumb={crumb} />
        <div className="flex-1 overflow-y-auto p-6 bg-bg">
          {children}
        </div>
      </main>
    </div>
  )
}
