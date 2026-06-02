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
  // Keep the shareable link pointing at the SPA basename so external
  // guests land on our React page, not the legacy `www` handler.
  return `${window.location.origin}/v2/${room.name}`
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
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      {I.Calendar(size)}
      <span
        className="absolute -right-[3px] -bottom-[3px] bg-card rounded-full inline-flex items-center justify-center"
        style={{ width: size * 0.65, height: size * 0.65 }}
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
    <div className="rf-row grid grid-cols-[auto_1fr_auto] items-center gap-x-[18px] px-5 py-3.5 border-b border-border cursor-pointer relative">
      <div className="flex items-center gap-2.5 shrink-0">
        <StatusDot status="idle" size={7} />
      </div>

      <div className="min-w-0 flex flex-col gap-[5px]">
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap gap-y-1">
          <a
            href={roomUrl(room)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[14.5px] font-semibold text-fg no-underline"
          >
            <span className="text-fg-muted font-medium">/</span>
            <span>{room.name}</span>
          </a>
          {room.ics_enabled && (
            <Pill icon={I.Calendar(10)} title="Calendar sync enabled">
              Calendar
            </Pill>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-y-[3px] gap-x-0 text-[11.5px] text-fg-muted font-sans">
          <span className="inline-flex items-center gap-[5px]">
            <span
              className="w-2 h-2 rounded-[2px] inline-block"
              style={{ background: PLATFORM_COLOR[room.platform] }}
            />
            {platformLabel(room.platform)}
          </span>

          <Dot />
          <span className="inline-flex items-center gap-[5px]">
            {I.Users(11)} {roomModeLabel(room.room_mode)}
          </span>

          {recording && (
            <>
              <Dot />
              <span className="inline-flex items-center gap-[5px]">
                {room.recording_type === 'cloud' ? I.Cloud(11) : I.Download(11)}
                {recording}
              </span>
            </>
          )}

          {room.zulip_auto_post && room.zulip_stream && (
            <>
              <Dot />
              <span className="inline-flex items-center gap-[5px] min-w-0">
                <span className="inline-flex items-center justify-center w-3 h-3 text-[9px] font-bold bg-[var(--gh-grey-5)] text-[var(--gh-off-white)] rounded-[2px] font-sans">
                  Z
                </span>
                <span className="font-mono text-[11px]">
                  {room.zulip_stream}
                  {room.zulip_topic && (
                    <>
                      <span className="text-[var(--gh-grey-3)] mx-1">›</span>
                      {room.zulip_topic}
                    </>
                  )}
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        {copied && (
          <span className="text-status-ok text-[11.5px] font-mono font-semibold pr-1.5">
            Copied
          </span>
        )}
        <div className="flex gap-0.5">
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
      className="inline-flex items-center gap-1 px-[7px] py-px h-[18px] font-sans text-[10.5px] font-medium text-fg-muted bg-muted border border-border rounded-full"
    >
      {icon}
      {children}
    </span>
  )
}

function Dot() {
  return <span className="mx-2.5 text-[var(--gh-grey-3)]">·</span>
}
