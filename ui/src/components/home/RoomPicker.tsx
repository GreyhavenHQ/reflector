import { I } from '@/components/icons'
import type { RoomRowData } from '@/lib/types'

type Props = {
  roomId: string
  setRoomId: (v: string) => void
  rooms: RoomRowData[]
}

export function RoomPicker({ roomId, setRoomId, rooms }: Props) {
  return (
    <div>
      <label className="rf-label" htmlFor="rf-room">
        {I.Folder(13)} Attach to room{' '}
        <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>— optional</span>
      </label>
      <select
        id="rf-room"
        className="rf-select"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        style={{ marginTop: 6 }}
      >
        <option value="">— None —</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  )
}
