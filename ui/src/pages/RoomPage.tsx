import { useNavigate, useParams } from 'react-router-dom'
import { DailyRoom } from '@/components/rooms/DailyRoom'
import { WherebyRoom } from '@/components/rooms/WherebyRoom'
import { LiveKitRoom } from '@/components/rooms/LiveKitRoom'
import { MeetingSelection } from '@/components/rooms/MeetingSelection'
import { RoomError, RoomLoading } from '@/components/rooms/roomChrome'
import { GuestBanner } from '@/components/rooms/GuestBanner'
import {
  useRoomActiveMeetings,
  useRoomByName,
  useRoomCreateMeeting,
  useRoomDefaultMeeting,
  useRoomMeeting,
  type Meeting,
} from '@/hooks/useRoomMeetings'

/**
 * Top-level room page. Mirrors www's `RoomContainer`:
 *   - `/rooms/:roomName`                 → auto-join default meeting OR
 *                                          show MeetingSelection for ICS rooms
 *   - `/rooms/:roomName/:meetingId`      → join the explicit meeting
 * Dispatches to the appropriate platform renderer based on `meeting.platform`.
 */
export function RoomPage() {
  const navigate = useNavigate()
  const { roomName, meetingId } = useParams<{
    roomName: string
    meetingId?: string
  }>()

  const roomQuery = useRoomByName(roomName ?? null)
  const room = roomQuery.data

  const explicitMeetingQuery = useRoomMeeting(
    roomName ?? null,
    meetingId ?? null,
  )

  // Non-ICS rooms without an explicit meeting id: auto-pick or create one.
  const wantDefault = !!room && !room.ics_enabled && !meetingId
  const defaultMeeting = useRoomDefaultMeeting(
    wantDefault ? (roomName ?? null) : null,
    wantDefault,
  )

  // ICS rooms without an explicit meeting id: show the selection screen.
  const wantSelection = !!room && room.ics_enabled && !meetingId
  const activeMeetings = useRoomActiveMeetings(
    wantSelection ? (roomName ?? null) : null,
    wantSelection,
  )

  const createMeeting = useRoomCreateMeeting()

  const meeting: Meeting | null =
    explicitMeetingQuery.data || defaultMeeting.meeting

  const loading =
    roomQuery.isLoading ||
    (wantSelection && activeMeetings.isLoading) ||
    (!!meetingId && explicitMeetingQuery.isLoading) ||
    (!wantSelection && defaultMeeting.loading) ||
    createMeeting.isPending

  if (!roomName) {
    return <RoomError message="No room name" onLeave={() => navigate('/browse')} />
  }

  if (loading) return <RoomLoading label="Opening room…" />

  if (!room) {
    return <RoomError message="Room not found" onLeave={() => navigate('/browse')} />
  }

  const errs = [
    explicitMeetingQuery.error,
    defaultMeeting.error,
    roomQuery.error,
    createMeeting.error,
  ].filter((e): e is Error => !!e)
  if (errs.length > 0) {
    return (
      <RoomError
        message={errs[0]?.message ?? 'Something went wrong'}
        onLeave={() => navigate('/browse')}
      />
    )
  }

  // ICS room + no explicit id → meeting selection (or auto-route if only one option).
  if (wantSelection) {
    return (
      <>
        <GuestBanner roomName={roomName} />
        <MeetingSelection
          roomName={roomName}
          meetings={activeMeetings.data ?? []}
          loading={activeMeetings.isLoading}
          creating={createMeeting.isPending}
          onSelect={(m) => navigate(`/${roomName}/${m.id}`)}
          onCreateUnscheduled={async () => {
            try {
              const m = await createMeeting.mutateAsync({
                roomName,
                allowDuplicated: room.ics_enabled ?? false,
              })
              navigate(`/${roomName}/${m.id}`)
            } catch (err) {
              console.error('Failed to create meeting:', err)
            }
          }}
        />
      </>
    )
  }

  if (!meeting) {
    // defaultMeeting is probably still resolving — shouldn't usually hit
    // this branch because `loading` above would have caught it.
    return <RoomLoading label="Preparing meeting…" />
  }

  const platform = meeting.platform
  switch (platform) {
    case 'daily':
      return (
        <>
          <GuestBanner roomName={roomName} />
          <DailyRoom roomName={roomName} meeting={meeting} room={room} />
        </>
      )
    case 'whereby':
      return (
        <>
          <GuestBanner roomName={roomName} />
          <WherebyRoom roomName={roomName} meeting={meeting} room={room} />
        </>
      )
    case 'livekit':
      return (
        <>
          <GuestBanner roomName={roomName} />
          <LiveKitRoom roomName={roomName} meeting={meeting} room={room} />
        </>
      )
    default:
      return (
        <RoomError
          message={`Unknown platform: ${String(platform)}`}
          onLeave={() => navigate('/browse')}
        />
      )
  }
}
