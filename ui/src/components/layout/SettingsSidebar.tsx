import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { I } from '@/components/icons'
import { Button, SectionLabel, SidebarItem } from '@/components/ui/primitives'
import { BrandHeader, PrimaryNav, UserChip, sidebarAsideStyle } from './sidebarChrome'
import { useAuth } from '@/auth/AuthContext'

type SettingsNavItem = {
  id: string
  label: string
  icon: ReturnType<typeof I.Shield>
  path: string
}

// Add future sections here: language preferences, notifications, integrations,
// etc. Each entry becomes a SidebarItem when expanded and an icon button on
// the collapsed rail. Keep at least one entry so the section isn't empty.
const SETTINGS_NAV: SettingsNavItem[] = [
  { id: 'api-keys', label: 'API Keys', icon: I.Shield(15), path: '/settings/api-keys' },
]

type Props = {
  collapsed: boolean
  onToggle: () => void
  onNewRecording?: () => void
}

export function SettingsSidebar({ collapsed, onToggle, onNewRecording }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const isActive = (path: string) => location.pathname.startsWith(path)

  return (
    <aside style={sidebarAsideStyle(collapsed) as CSSProperties}>
      <BrandHeader collapsed={collapsed} onToggle={onToggle} />

      {collapsed ? (
        <SettingsRail onToggle={onToggle} onNewRecording={onNewRecording} />
      ) : (
        <>
          <div style={{ padding: '14px 12px 6px' }}>
            <Button
              variant="primary"
              size="md"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={onNewRecording}
            >
              {I.Mic(14)} New recording
            </Button>
          </div>

          <nav
            style={{
              flex: 1,
              padding: '6px 10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              overflowY: 'auto',
            }}
          >
            <PrimaryNav />

            <div
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '2px 6px',
              }}
            />

            <div>
              <SectionLabel>Settings</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {SETTINGS_NAV.map((item) => (
                  <SidebarItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={isActive(item.path)}
                    onClick={() => navigate(item.path)}
                  />
                ))}
              </div>
            </div>
          </nav>

          <UserChip user={user} />
        </>
      )}
    </aside>
  )
}

function SettingsRail({
  onToggle,
  onNewRecording,
}: {
  onToggle: () => void
  onNewRecording?: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <nav
      style={{
        flex: 1,
        padding: '10px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'center',
      }}
    >
      <Button variant="primary" size="icon" title="New recording" onClick={onNewRecording}>
        {I.Mic(16)}
      </Button>
      <div style={{ height: 10 }} />
      {SETTINGS_NAV.map((item) => {
        const on = location.pathname.startsWith(item.path)
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => navigate(item.path)}
            style={{
              width: 40,
              height: 40,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: on ? 'var(--border)' : 'transparent',
              borderRadius: 'var(--radius-md)',
              background: on ? 'var(--card)' : 'transparent',
              color: on ? 'var(--primary)' : 'var(--fg-muted)',
              cursor: 'pointer',
              boxShadow: on ? 'var(--shadow-xs)' : 'none',
            }}
          >
            {item.icon}
          </button>
        )
      })}
      <div style={{ marginTop: 'auto' }}>
        <button
          onClick={onToggle}
          title="Expand sidebar"
          style={{
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
          }}
        >
          {I.ChevronRight(16)}
        </button>
      </div>
    </nav>
  )
}
