import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { RoomsSidebar } from '@/components/layout/RoomsSidebar'
import { NewTranscriptDialog } from '@/components/shared/NewTranscriptDialog'
import { Button } from '@/components/ui/primitives'
import { I } from '@/components/icons'
import { RoomsTable } from '@/components/rooms/RoomsTable'
import { RoomFormDialog, type RoomFormPayload } from '@/components/rooms/RoomFormDialog'
import { DeleteRoomDialog } from '@/components/rooms/DeleteRoomDialog'
import { apiClient } from '@/api/client'
import { extractDetail, messageFor } from '@/lib/apiErrors'
import type { components } from '@/api/schema'
import type { RoomsFilter } from '@/lib/types'

type Room = components['schemas']['RoomDetails']

const EMPTY_ROOMS: Room[] = []


function matchesFilter(room: Room, filter: RoomsFilter) {
  if (filter.kind === 'all') return true
  if (filter.kind === 'scope')
    return filter.value === 'mine' ? !room.is_shared : room.is_shared
  if (filter.kind === 'status') {
    if (filter.value === 'active') return false
    if (filter.value === 'calendar') return room.ics_enabled
  }
  if (filter.kind === 'platform') return room.platform === filter.value
  if (filter.kind === 'size') return room.room_mode === filter.value
  if (filter.kind === 'recording') return room.recording_type === filter.value
  return true
}

function titleFor(filter: RoomsFilter) {
  if (filter.kind === 'all') return 'Rooms'
  if (filter.kind === 'scope')
    return filter.value === 'mine' ? 'My rooms' : 'Shared rooms'
  if (filter.kind === 'status') {
    if (filter.value === 'active') return 'Active rooms'
    if (filter.value === 'calendar') return 'Calendar-linked rooms'
  }
  if (filter.kind === 'platform')
    return `${filter.value.charAt(0).toUpperCase() + filter.value.slice(1)} rooms`
  if (filter.kind === 'size')
    return filter.value === 'group' ? 'Group rooms (2–200)' : 'Small rooms (2–4)'
  if (filter.kind === 'recording') return `Recording: ${filter.value}`
  return 'Rooms'
}

export function RoomsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<RoomsFilter>({ kind: 'all', value: null })
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [formRoom, setFormRoom] = useState<Room | null | 'new'>(null)
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const roomsQuery = useQuery({
    queryKey: ['rooms', 'all'],
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/rooms', {
        params: { query: { page: 1, size: 100 } as never },
      })
      if (!response.ok || !data) throw new Error('Failed to load rooms')
      return (data as { items: Room[] }).items
    },
  })

  const rooms = roomsQuery.data ?? EMPTY_ROOMS

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rooms.filter((r) => {
      if (!matchesFilter(r, filter)) return false
      if (q && !r.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rooms, filter, search])

  const mine = filtered.filter((r) => !r.is_shared)
  const shared = filtered.filter((r) => r.is_shared)

  const createRoom = useMutation({
    mutationFn: async (body: RoomFormPayload) => {
      const { data, response, error } = await apiClient.POST('/v1/rooms', {
        body: body as never,
      })
      if (!response.ok || !data) {
        throw Object.assign(new Error('Could not create room'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Room created')
      setFormRoom(null)
    },
    onError: (err) => toast.error(messageFor(err, 'Create failed')),
  })

  const updateRoom = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: RoomFormPayload }) => {
      const { name: _name, ...updatable } = patch
      const { data, response, error } = await apiClient.PATCH('/v1/rooms/{room_id}', {
        params: { path: { room_id: id } },
        body: updatable as never,
      })
      if (!response.ok || !data) {
        throw Object.assign(new Error('Could not update room'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Room updated')
      setFormRoom(null)
    },
    onError: (err) => toast.error(messageFor(err, 'Update failed')),
  })

  const destroyRoom = useMutation({
    mutationFn: async (id: string) => {
      const { response } = await apiClient.DELETE('/v1/rooms/{room_id}', {
        params: { path: { room_id: id } },
      })
      if (!response.ok) throw new Error('Could not delete room')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Room deleted')
      setDeleteRoom(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const handleSave = async (patch: RoomFormPayload) => {
    if (formRoom && formRoom !== 'new') {
      await updateRoom.mutateAsync({ id: formRoom.id, patch })
    } else {
      await createRoom.mutateAsync(patch)
    }
  }

  const handleCopy = (r: Room) => {
    navigator.clipboard.writeText(`${window.location.origin}/${r.name}`).then(
      () => {
        setCopiedId(r.id)
        setTimeout(
          () => setCopiedId((prev) => (prev === r.id ? null : prev)),
          1500,
        )
      },
      () => toast.error('Could not copy'),
    )
  }

  const showBothSections = filter.kind === 'all'

  return (
    <AppShell
      title={titleFor(filter)}
      crumb={['workspace', 'rooms']}
      sidebar={
        <RoomsSidebar
          filter={filter}
          onFilter={setFilter}
          rooms={rooms}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onNewRecording={() => setNewOpen(true)}
        />
      }
    >
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 13 }}>
            {filtered.length} {filtered.length === 1 ? 'room' : 'rooms'}
          </span>
          <div
            style={{
              marginLeft: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 30,
              padding: '0 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              width: 320,
              maxWidth: '40%',
            }}
          >
            <span style={{ color: 'var(--fg-muted)', display: 'inline-flex' }}>
              {I.Search(13)}
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rooms, streams, topics…"
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: 12.5,
                color: 'var(--fg)',
                flex: 1,
              }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['rooms'] })}
          >
            {I.Refresh(13)} Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setFormRoom('new')}>
            {I.Plus(13)} New room
          </Button>
        </div>

        <div style={{ overflowY: 'auto' }}>
          {roomsQuery.isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-muted)' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: '80px 24px',
                textAlign: 'center',
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 9999,
                  background: 'var(--muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gh-grey-4)',
                  marginBottom: 12,
                }}
              >
                {I.Door(22)}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--fg)',
                }}
              >
                {search ? `No rooms match “${search}”` : 'No rooms match this filter'}
              </div>
              <div style={{ fontSize: 13, maxWidth: 360, margin: '8px auto 0' }}>
                {search
                  ? 'Try a different term, or clear the search.'
                  : 'Clear the sidebar filter, or create a new room to get started.'}
              </div>
            </div>
          ) : showBothSections ? (
            <>
              {mine.length > 0 && (
                <Section label="My rooms" count={mine.length}>
                  <RoomsTable
                    rooms={mine}
                    onEdit={setFormRoom}
                    onDelete={setDeleteRoom}
                    onCopy={handleCopy}
                    copiedId={copiedId}
                  />
                </Section>
              )}
              {shared.length > 0 && (
                <Section label="Shared rooms" count={shared.length}>
                  <RoomsTable
                    rooms={shared}
                    onEdit={setFormRoom}
                    onDelete={setDeleteRoom}
                    onCopy={handleCopy}
                    copiedId={copiedId}
                  />
                </Section>
              )}
            </>
          ) : (
            <Section label={titleFor(filter)} count={filtered.length}>
              <RoomsTable
                rooms={filtered}
                onEdit={setFormRoom}
                onDelete={setDeleteRoom}
                onCopy={handleCopy}
                copiedId={copiedId}
              />
            </Section>
          )}
        </div>
      </div>

      {formRoom !== null && (
        <RoomFormDialog
          room={formRoom === 'new' ? null : formRoom}
          onClose={() => setFormRoom(null)}
          onSave={handleSave}
          saving={createRoom.isPending || updateRoom.isPending}
        />
      )}

      {deleteRoom && (
        <DeleteRoomDialog
          name={deleteRoom.name}
          onClose={() => setDeleteRoom(null)}
          onConfirm={() => destroyRoom.mutate(deleteRoom.id)}
          loading={destroyRoom.isPending}
        />
      )}

      {newOpen && <NewTranscriptDialog onClose={() => setNewOpen(false)} />}
    </AppShell>
  )
}

function Section({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '18px 20px 10px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--fg)',
            letterSpacing: '-0.005em',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-muted)',
          }}
        >
          {count} {count === 1 ? 'room' : 'rooms'}
        </span>
      </div>
      {children}
    </div>
  )
}
