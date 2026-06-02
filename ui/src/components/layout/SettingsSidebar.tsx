import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { I } from '@/components/icons'
import { Button, SectionLabel, SidebarItem } from '@/components/ui/primitives'
import { BrandHeader, PrimaryNav, UserChip, sidebarAsideStyle } from './sidebarChrome'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'

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
          <div className="pt-3.5 px-3 pb-1.5">
            <Button
              variant="primary"
              size="md"
              className="w-full justify-start"
              onClick={onNewRecording}
            >
              {I.Mic(14)} New recording
            </Button>
          </div>

          <nav className="flex-1 pt-1.5 px-2.5 pb-3 flex flex-col gap-3.5 overflow-y-auto">
            <PrimaryNav />

            <div className="h-px bg-border mx-1.5 my-0.5" />

            <div>
              <SectionLabel>Settings</SectionLabel>
              <div className="flex flex-col gap-px">
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
    <nav className="flex-1 py-2.5 px-2 flex flex-col gap-1 items-center">
      <Button variant="primary" size="icon" title="New recording" onClick={onNewRecording}>
        {I.Mic(16)}
      </Button>
      <div className="h-2.5" />
      {SETTINGS_NAV.map((item) => {
        const on = location.pathname.startsWith(item.path)
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => navigate(item.path)}
            className={cn(
              'w-10 h-10 inline-flex items-center justify-center border rounded-md cursor-pointer',
              on
                ? 'border-border bg-card text-primary shadow-xs'
                : 'border-transparent bg-transparent text-fg-muted shadow-none',
            )}
          >
            {item.icon}
          </button>
        )
      })}
      <div className="mt-auto">
        <button
          onClick={onToggle}
          title="Expand sidebar"
          className="w-10 h-10 inline-flex items-center justify-center border-none bg-transparent text-fg-muted cursor-pointer"
        >
          {I.ChevronRight(16)}
        </button>
      </div>
    </nav>
  )
}
