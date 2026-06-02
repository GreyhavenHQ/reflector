import type { CSSProperties } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { Button, SectionLabel, SidebarItem } from '@/components/ui/primitives'
import type { RoomsFilter } from '@/lib/types'
import { BrandHeader, PrimaryNav, UserChip, sidebarAsideStyle } from './sidebarChrome'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'

type Room = components['schemas']['RoomDetails']

type Props = {
  filter: RoomsFilter
  onFilter: (f: RoomsFilter) => void
  rooms: Room[]
  collapsed: boolean
  onToggle: () => void
  onNewRecording?: () => void
}

const PLATFORM_COLOR: Record<Room['platform'], string> = {
  whereby: 'var(--status-processing)',
  daily: 'var(--status-ok)',
  livekit: 'var(--primary)',
}

const PLATFORMS: Room['platform'][] = ['whereby', 'daily', 'livekit']

export function RoomsSidebar({
  filter,
  onFilter,
  rooms,
  collapsed,
  onToggle,
  onNewRecording,
}: Props) {
  const { user } = useAuth()
  const isActive = (
    kind: RoomsFilter['kind'],
    val: RoomsFilter['value'] | null = null,
  ) => filter.kind === kind && (filter.value ?? null) === val

  const counts = {
    all: rooms.length,
    mine: rooms.filter((r) => !r.is_shared).length,
    shared: rooms.filter((r) => r.is_shared).length,
    calendar: rooms.filter((r) => r.ics_enabled).length,
  }

  const platformCount = (p: Room['platform']) =>
    rooms.filter((r) => r.platform === p).length
  const sizeCount = (s: string) => rooms.filter((r) => r.room_mode === s).length
  const recCount = (t: string) => rooms.filter((r) => r.recording_type === t).length

  const presentPlatforms = PLATFORMS.filter((p) => platformCount(p) > 0)

  return (
    <aside style={sidebarAsideStyle(collapsed) as CSSProperties}>
      <BrandHeader collapsed={collapsed} onToggle={onToggle} />

      {collapsed ? (
        <RoomsRail
          filter={filter}
          onFilter={onFilter}
          onToggle={onToggle}
          onNewRecording={onNewRecording}
        />
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

            <div className="flex flex-col gap-px">
              <SidebarItem
                icon={I.Door(15)}
                label="All rooms"
                count={counts.all}
                active={isActive('all')}
                onClick={() => onFilter({ kind: 'all', value: null })}
              />
              <SidebarItem
                icon={I.User(14)}
                label="My rooms"
                count={counts.mine}
                active={isActive('scope', 'mine')}
                onClick={() => onFilter({ kind: 'scope', value: 'mine' })}
              />
              <SidebarItem
                icon={I.Share(14)}
                label="Shared"
                count={counts.shared}
                active={isActive('scope', 'shared')}
                onClick={() => onFilter({ kind: 'scope', value: 'shared' })}
              />
            </div>

            <div>
              <SectionLabel>Status</SectionLabel>
              <div className="flex flex-col gap-px">
                <SidebarItem
                  icon={I.Radio(14)}
                  label="Active now"
                  dot="var(--status-live)"
                  count={0}
                  active={isActive('status', 'active')}
                  onClick={() => onFilter({ kind: 'status', value: 'active' })}
                />
                <SidebarItem
                  icon={I.Calendar(14)}
                  label="Calendar-linked"
                  count={counts.calendar}
                  active={isActive('status', 'calendar')}
                  onClick={() => onFilter({ kind: 'status', value: 'calendar' })}
                />
              </div>
            </div>

            {presentPlatforms.length > 0 && (
              <div>
                <SectionLabel>Platform</SectionLabel>
                <div className="flex flex-col gap-px">
                  {presentPlatforms.map((p) => (
                    <SidebarItem
                      key={p}
                      icon={
                        <span
                          className="w-3.5 h-3.5 rounded-[3px] inline-block"
                          style={{ background: PLATFORM_COLOR[p] }}
                        />
                      }
                      label={p.charAt(0).toUpperCase() + p.slice(1)}
                      count={platformCount(p)}
                      active={isActive('platform', p)}
                      onClick={() => onFilter({ kind: 'platform', value: p })}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionLabel>Size</SectionLabel>
              <div className="flex flex-col gap-px">
                <SidebarItem
                  icon={I.User(14)}
                  label="2–4 people"
                  count={sizeCount('normal')}
                  active={isActive('size', 'normal')}
                  onClick={() => onFilter({ kind: 'size', value: 'normal' })}
                />
                <SidebarItem
                  icon={I.Users(14)}
                  label="2–200 people"
                  count={sizeCount('group')}
                  active={isActive('size', 'group')}
                  onClick={() => onFilter({ kind: 'size', value: 'group' })}
                />
              </div>
            </div>

            <div>
              <SectionLabel>Recording</SectionLabel>
              <div className="flex flex-col gap-px">
                <SidebarItem
                  icon={I.Cloud(14)}
                  label="Cloud"
                  count={recCount('cloud')}
                  active={isActive('recording', 'cloud')}
                  onClick={() => onFilter({ kind: 'recording', value: 'cloud' })}
                />
                <SidebarItem
                  icon={I.Download(14)}
                  label="Local"
                  count={recCount('local')}
                  active={isActive('recording', 'local')}
                  onClick={() => onFilter({ kind: 'recording', value: 'local' })}
                />
                <SidebarItem
                  icon={I.X(14)}
                  label="None"
                  count={recCount('none')}
                  active={isActive('recording', 'none')}
                  onClick={() => onFilter({ kind: 'recording', value: 'none' })}
                />
              </div>
            </div>
          </nav>

          <UserChip user={user} />
        </>
      )}
    </aside>
  )
}

type RailProps = {
  filter: RoomsFilter
  onFilter: (f: RoomsFilter) => void
  onToggle: () => void
  onNewRecording?: () => void
}

function RoomsRail({ filter, onFilter, onToggle, onNewRecording }: RailProps) {
  const items: Array<{
    kind: RoomsFilter['kind']
    value: RoomsFilter['value'] | null
    icon: ReturnType<typeof I.Door>
    title: string
  }> = [
    { kind: 'all', value: null, icon: I.Door(18), title: 'All rooms' },
    { kind: 'scope', value: 'mine', icon: I.User(18), title: 'My rooms' },
    { kind: 'scope', value: 'shared', icon: I.Share(18), title: 'Shared' },
    { kind: 'status', value: 'active', icon: I.Radio(18), title: 'Active' },
    { kind: 'status', value: 'calendar', icon: I.Calendar(18), title: 'Calendar' },
  ]
  return (
    <nav className="flex-1 py-2.5 px-2 flex flex-col gap-1 items-center">
      <Button variant="primary" size="icon" title="New recording" onClick={onNewRecording}>
        {I.Mic(16)}
      </Button>
      <div className="h-2.5" />
      {items.map((it, i) => {
        const on =
          filter.kind === it.kind && (filter.value ?? null) === (it.value ?? null)
        return (
          <button
            key={i}
            title={it.title}
            onClick={() =>
              onFilter({ kind: it.kind, value: it.value } as RoomsFilter)
            }
            className={cn(
              'w-10 h-10 inline-flex items-center justify-center border rounded-md cursor-pointer',
              on
                ? 'border-border bg-card text-primary shadow-xs'
                : 'border-transparent bg-transparent text-fg-muted shadow-none',
            )}
          >
            {it.icon}
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
