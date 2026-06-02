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
        <span className="text-fg-muted font-normal">— optional</span>
      </label>
      <select
        id="rf-room"
        className="rf-select mt-1.5"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
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
