import type { CSSProperties } from 'react'
import { I } from '@/components/icons'
import { Button, SectionLabel, SidebarItem } from '@/components/ui/primitives'
import type { RoomRowData, SidebarFilter, TagRowData } from '@/lib/types'
import { BrandHeader, PrimaryNav, UserChip, sidebarAsideStyle } from './sidebarChrome'
import { useAuth } from '@/auth/AuthContext'

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                <span style={{ color: 'var(--fg-muted)', cursor: 'pointer', opacity: 0.6 }}>+</span>
              }
            >
              My rooms
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                <span style={{ color: 'var(--fg-muted)', cursor: 'pointer', opacity: 0.6 }}>+</span>
              }
            >
              Tags
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
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
      {items.map((it, i) => {
        const on = filter.kind === it.kind && (filter.value ?? null) === (it.value ?? null)
        return (
          <button
            key={i}
            title={it.title}
            onClick={() =>
              onFilter({ kind: it.kind, value: (it.value ?? null) as never } as SidebarFilter)
            }
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
            {it.icon}
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
