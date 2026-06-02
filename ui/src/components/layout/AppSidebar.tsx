import type { CSSProperties } from 'react'
import { I } from '@/components/icons'
import { Button, SectionLabel, SidebarItem } from '@/components/ui/primitives'
import type { RoomRowData, SidebarFilter, TagRowData } from '@/lib/types'
import { BrandHeader, PrimaryNav, UserChip, sidebarAsideStyle } from './sidebarChrome'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'

type AppSidebarProps = {
  filter: SidebarFilter
  onFilter: (filter: SidebarFilter) => void
  rooms: RoomRowData[]
  tags: TagRowData[]
  showTags?: boolean
  collapsed: boolean
  onToggle: () => void
  onNewRecording?: () => void
  counts?: {
    all?: number | null
    liveTranscripts?: number | null
    uploadedFiles?: number | null
    trash?: number | null
  }
}

export function AppSidebar({
  filter,
  onFilter,
  rooms,
  tags,
  showTags = true,
  collapsed,
  onToggle,
  onNewRecording,
  counts,
}: AppSidebarProps) {
  const { user } = useAuth()
  const myRooms = rooms.filter((r) => !r.shared)
  const sharedRooms = rooms.filter((r) => r.shared)

  return (
    <aside style={sidebarAsideStyle(collapsed) as CSSProperties}>
      <BrandHeader collapsed={collapsed} onToggle={onToggle} />

      {collapsed ? (
        <CollapsedRail
          filter={filter}
          onFilter={onFilter}
          onToggle={onToggle}
          onNewRecording={onNewRecording}
        />
      ) : (
        <ExpandedNav
          filter={filter}
          onFilter={onFilter}
          myRooms={myRooms}
          sharedRooms={sharedRooms}
          tags={tags}
          showTags={showTags}
          onNewRecording={onNewRecording}
          counts={counts}
        />
      )}

      {!collapsed && <UserChip user={user} />}
    </aside>
  )
}

type ExpandedNavProps = {
  filter: SidebarFilter
  onFilter: (filter: SidebarFilter) => void
  myRooms: RoomRowData[]
  sharedRooms: RoomRowData[]
  tags: TagRowData[]
  showTags?: boolean
  onNewRecording?: () => void
  counts?: AppSidebarProps['counts']
}

function ExpandedNav({
  filter,
  onFilter,
  myRooms,
  sharedRooms,
  tags,
  showTags = true,
  onNewRecording,
  counts,
}: ExpandedNavProps) {
  const isActive = (kind: SidebarFilter['kind'], val: SidebarFilter['value'] = null) =>
    filter.kind === kind && filter.value === val

  return (
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
            icon={I.Inbox(15)}
            label="All transcripts"
            count={counts?.all ?? null}
            active={isActive('all')}
            onClick={() => onFilter({ kind: 'all', value: null })}
          />
          <SidebarItem
            icon={I.Sparkle(15)}
            label="Recent"
            active={isActive('recent')}
            onClick={() => onFilter({ kind: 'recent', value: null })}
          />
        </div>

        <div>
          <SectionLabel>Sources</SectionLabel>
          <div className="flex flex-col gap-px">
            <SidebarItem
              icon={I.Radio(15)}
              label="Live transcripts"
              dot={
                filter.kind === 'source' && filter.value === 'live'
                  ? undefined
                  : 'var(--status-live)'
              }
              count={counts?.liveTranscripts ?? null}
              active={isActive('source', 'live')}
              onClick={() => onFilter({ kind: 'source', value: 'live' })}
            />
            <SidebarItem
              icon={I.Upload(15)}
              label="Uploaded files"
              count={counts?.uploadedFiles ?? null}
              active={isActive('source', 'file')}
              onClick={() => onFilter({ kind: 'source', value: 'file' })}
            />
          </div>
        </div>

        {myRooms.length > 0 && (
          <div>
            <SectionLabel
              action={
                <span className="text-fg-muted cursor-pointer opacity-60">+</span>
              }
            >
              My rooms
            </SectionLabel>
            <div className="flex flex-col gap-px">
              {myRooms.map((r) => (
                <SidebarItem
                  key={r.id}
                  icon={I.Door(15)}
                  label={r.name}
                  count={r.count}
                  active={isActive('room', r.id)}
                  onClick={() => onFilter({ kind: 'room', value: r.id })}
                />
              ))}
            </div>
          </div>
        )}

        {sharedRooms.length > 0 && (
          <div>
            <SectionLabel>Shared</SectionLabel>
            <div className="flex flex-col gap-px">
              {sharedRooms.map((r) => (
                <SidebarItem
                  key={r.id}
                  icon={I.Users(14)}
                  label={r.name}
                  count={r.count}
                  active={isActive('room', r.id)}
                  onClick={() => onFilter({ kind: 'room', value: r.id })}
                />
              ))}
            </div>
          </div>
        )}

        {showTags && tags.length > 0 && (
          <div>
            <SectionLabel
              action={
                <span className="text-fg-muted cursor-pointer opacity-60">+</span>
              }
            >
              Tags
            </SectionLabel>
            <div className="flex flex-col gap-px">
              {tags.map((t) => (
                <SidebarItem
                  key={t.id}
                  icon={I.Tag(14)}
                  label={t.name}
                  count={t.count}
                  active={isActive('tag', t.id)}
                  onClick={() => onFilter({ kind: 'tag', value: t.id })}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto border-t border-border pt-2.5">
          <SidebarItem
            icon={I.Trash(15)}
            label="Trash"
            active={isActive('trash')}
            onClick={() => onFilter({ kind: 'trash', value: null })}
            count={counts?.trash ?? null}
          />
        </div>
      </nav>
    </>
  )
}

type CollapsedRailProps = {
  filter: SidebarFilter
  onFilter: (filter: SidebarFilter) => void
  onToggle: () => void
  onNewRecording?: () => void
}

function CollapsedRail({ filter, onFilter, onToggle, onNewRecording }: CollapsedRailProps) {
  const items: Array<{
    kind: SidebarFilter['kind']
    value?: SidebarFilter['value']
    icon: ReturnType<typeof I.Inbox>
    title: string
  }> = [
    { kind: 'all', icon: I.Inbox(18), title: 'All' },
    { kind: 'recent', icon: I.Sparkle(18), title: 'Recent' },
    { kind: 'source', value: 'live', icon: I.Radio(18), title: 'Live' },
    { kind: 'source', value: 'file', icon: I.Upload(18), title: 'Uploads' },
    { kind: 'trash', icon: I.Trash(18), title: 'Trash' },
  ]
  return (
    <nav className="flex-1 py-2.5 px-2 flex flex-col gap-1 items-center">
      <Button variant="primary" size="icon" title="New recording" onClick={onNewRecording}>
        {I.Mic(16)}
      </Button>
      <div className="h-2.5" />
      {items.map((it, i) => {
        const on = filter.kind === it.kind && (filter.value ?? null) === (it.value ?? null)
        return (
          <button
            key={i}
            title={it.title}
            onClick={() =>
              onFilter({ kind: it.kind, value: (it.value ?? null) as never } as SidebarFilter)
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
