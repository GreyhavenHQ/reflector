import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import {
  useRoomJoinMeeting,
  type Meeting,
  type RoomDetails,
} from '@/hooks/useRoomMeetings'
import { RoomError, RoomLoading } from './roomChrome'

// The <whereby-embed> web component registers itself when
// @whereby.com/browser-sdk/embed is imported. Use Whereby's host_room_url
// when present (owner-ish experience), otherwise fall back to room_url.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'whereby-embed': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { room?: string },
        HTMLElement
      >
    }
  }
}

type Props = {
  roomName: string
  meeting: Meeting
  room: RoomDetails
}

export function WherebyRoom({ roomName, meeting, room: _room }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const join = useRoomJoinMeeting()
  const [sdkReady, setSdkReady] = useState(false)
  const [joined, setJoined] = useState<Meeting | null>(null)
  const [error, setError] = useState<string | null>(null)
  const embedRef = useRef<HTMLElement>(null)

  // Lazy-load the Whereby browser SDK so the <whereby-embed> custom
  // element gets registered. Dynamic import keeps it out of the main
  // bundle for users who never visit a Whereby room.
  useEffect(() => {
    let cancelled = false
    import('@whereby.com/browser-sdk/embed')
      .then(() => {
        if (!cancelled) setSdkReady(true)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Whereby SDK failed to load — ${err.message}`
              : 'Whereby SDK failed to load',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    join
      .mutateAsync({
        roomName,
        meetingId: meeting.id,
        displayName: user?.name ?? user?.email ?? undefined,
      })
      .then((m) => {
        if (!cancelled) setJoined(m)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to join meeting')
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id, roomName])

  useEffect(() => {
    const el = embedRef.current
    if (!el) return
    const onLeave = () => navigate('/browse')
    el.addEventListener('leave', onLeave)
    return () => el.removeEventListener('leave', onLeave)
  }, [joined, sdkReady, navigate])

  if (error) return <RoomError message={error} onLeave={() => navigate('/browse')} />
  if (!sdkReady || !joined) {
    return <RoomLoading label={sdkReady ? 'Joining meeting…' : 'Loading Whereby…'} />
  }

  const url = joined.host_room_url || joined.room_url
  return (
    <div className="fixed inset-0 bg-[var(--gh-off-black)]">
      <whereby-embed
        ref={embedRef}
        room={url}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
