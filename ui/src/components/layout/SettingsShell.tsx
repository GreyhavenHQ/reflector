import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from './AppShell'
import { SettingsSidebar } from './SettingsSidebar'

type Props = {
  title: string
  crumb: string[]
  children: ReactNode
}

/**
 * Shell for pages under `/settings/*`. Uses the settings-scoped sidebar
 * (Settings section) instead of the transcripts/rooms filter sidebars, while
 * keeping the main-nav (Transcripts/Rooms), the New Recording affordance,
 * and the UserChip consistent across the app.
 */
export function SettingsShell({ title, crumb, children }: Props) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <AppShell
      title={title}
      crumb={crumb}
      sidebar={
        <SettingsSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onNewRecording={() => navigate('/transcripts/new')}
        />
      }
    >
      {children}
    </AppShell>
  )
}
