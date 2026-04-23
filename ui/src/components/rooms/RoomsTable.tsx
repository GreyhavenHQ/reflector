import { type ReactNode } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { Button, RowMenuTrigger, StatusDot } from '@/components/ui/primitives'

type Room = components['schemas']['RoomDetails']

type Props = {
  rooms: Room[]
  onEdit?: (room: Room) => void
  onDelete?: (room: Room) => void
  onCopy?: (room: Room) => void
  copiedId?: string | null
}

const PLATFORM_COLOR: Record<Room['platform'], string> = {
  whereby: 'var(--status-processing)',
  daily: 'var(--status-ok)',
  livekit: 'var(--primary)',
}

function platformLabel(p: Room['platform']) {
  return p.charAt(0).toUpperCase() + p.slice(1)
}

function roomUrl(room: Room) {
  return `${window.location.origin}/${room.name}`
}

function openRoom(room: Room) {
  window.open(roomUrl(room), '_blank', 'noopener,noreferrer')
}

function roomModeLabel(mode: string) {
  if (mode === 'normal') return '2-4'
  if (mode === 'group') return '2-200'
  return mode
}

function recordingLabel(type: string, trigger: string | null | undefined) {
  if (type === 'none') return null
  if (type === 'local') return 'Local recording'
  if (type === 'cloud') {
    if (trigger === 'automatic-2nd-participant') return 'Cloud · auto'
    if (trigger === 'prompt') return 'Cloud · prompt'
    return 'Cloud'
  }
  return type
}

function CalendarSyncIcon({ size = 14 }: { size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      {I.Calendar(size)}
      <span
        style={{
          position: 'absolute',
          right: -3,
          bottom: -3,
          width: size * 0.65,
          height: size * 0.65,
          background: 'var(--card)',
          borderRadius: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {I.Refresh(size * 0.55)}
      </span>
    </span>
  )
}

export function RoomsTable({ rooms, onEdit, onDelete, onCopy, copiedId }: Props) {
  if (rooms.length === 0) return null
  return (
    <div>
      {rooms.map((r) => (
        <RoomRow
          key={r.id}
          room={r}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopy={onCopy}
          copied={copiedId === r.id}
        />
      ))}
    </div>
  )
}

type RoomRowProps = {
  room: Room
  onEdit?: (room: Room) => void
  onDelete?: (room: Room) => void
  onCopy?: (room: Room) => void
  copied?: boolean
}

function RoomRow({ room, onEdit, onDelete, onCopy, copied }: RoomRowProps) {
  const recording = recordingLabel(room.recording_type, room.recording_trigger)
  return (
    <div
      className="rf-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        columnGap: 18,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <StatusDot status="idle" size={7} />
      </div>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
            flexWrap: 'wrap',
            rowGap: 4,
          }}
        >
          <a
            href={roomUrl(room)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--fg)',
              textDecoration: 'none',
            }}
          >
            <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>/</span>
            <span>{room.name}</span>
          </a>
          {room.ics_enabled && (
            <Pill icon={I.Calendar(10)} title="Calendar sync enabled">
              Calendar
            </Pill>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 3,
            columnGap: 0,
            fontSize: 11.5,
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                display: 'inline-block',
                background: PLATFORM_COLOR[room.platform],
              }}
            />
            {platformLabel(room.platform)}
          </span>

          <Dot />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {I.Users(11)} {roomModeLabel(room.room_mode)}
          </span>

          {recording && (
            <>
              <Dot />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {room.recording_type === 'cloud' ? I.Cloud(11) : I.Download(11)}
                {recording}
              </span>
            </>
          )}

          {room.zulip_auto_post && room.zulip_stream && (
            <>
              <Dot />
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 12,
                    height: 12,
                    fontSize: 9,
                    fontWeight: 700,
                    background: 'var(--gh-grey-5)',
                    color: 'var(--gh-off-white)',
                    borderRadius: 2,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Z
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {room.zulip_stream}
                  {room.zulip_topic && (
                    <>
                      <span style={{ color: 'var(--gh-grey-3)', margin: '0 4px' }}>›</span>
                      {room.zulip_topic}
                    </>
                  )}
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {copied && (
          <span
            style={{
              color: 'var(--status-ok)',
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              paddingRight: 6,
            }}
          >
            Copied
          </span>
        )}
        <div style={{ display: 'flex', gap: 2 }}>
          {room.ics_enabled && (
            <Button
              variant="ghost"
              size="iconSm"
              title="Force calendar sync"
              onClick={(e) => e.stopPropagation()}
            >
              <CalendarSyncIcon size={14} />
            </Button>
          )}
          {!copied && onCopy && (
            <Button
              variant="ghost"
              size="iconSm"
              title="Copy room URL"
              onClick={(e) => {
                e.stopPropagation()
                onCopy(room)
              }}
            >
              {I.Link(14)}
            </Button>
          )}
          <RowMenuTrigger
            items={[
              {
                label: 'Open room',
                icon: I.ExternalLink(14),
                onClick: () => openRoom(room),
              },
              {
                label: 'Copy URL',
                icon: I.Link(14),
                onClick: () => onCopy?.(room),
              },
              { separator: true },
              {
                label: 'Edit settings',
                icon: I.Edit(14),
                onClick: () => onEdit?.(room),
              },
              {
                label: 'Delete room',
                icon: I.Trash(14),
                onClick: () => onDelete?.(room),
                danger: true,
              },
            ]}
            label="Room options"
          />
        </div>
      </div>
    </div>
  )
}

function Pill({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 7px',
        height: 18,
        fontFamily: 'var(--font-sans)',
        fontSize: 10.5,
        fontWeight: 500,
        color: 'var(--fg-muted)',
        background: 'var(--muted)',
        border: '1px solid var(--border)',
        borderRadius: 9999,
      }}
    >
      {icon}
      {children}
    </span>
  )
}

function Dot() {
  return <span style={{ margin: '0 10px', color: 'var(--gh-grey-3)' }}>·</span>
}
