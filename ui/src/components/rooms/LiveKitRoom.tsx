import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LiveKitRoom as LKRoom,
  PreJoin,
  RoomAudioRenderer,
  VideoConference,
  type LocalUserChoices,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { useAuth } from '@/auth/AuthContext'
import {
  useRoomJoinMeeting,
  type Meeting,
  type RoomDetails,
} from '@/hooks/useRoomMeetings'
import { RoomError, RoomLoading } from './roomChrome'

type Props = {
  roomName: string
  meeting: Meeting
  room: RoomDetails
}

/**
 * Parse the `room_url` returned by the backend. It arrives shaped like
 *   ws://host:7880?room=<name>&token=<jwt>
 * The LiveKit SDK wants the three pieces separately.
 */
function parseLiveKitUrl(roomUrl: string): {
  serverUrl: string
  roomName: string | null
  token: string | null
} {
  try {
    const url = new URL(roomUrl)
    const token = url.searchParams.get('token')
    const lkRoom = url.searchParams.get('room')
    url.searchParams.delete('token')
    url.searchParams.delete('room')
    const serverUrl = url.toString().replace(/[?/]+$/, '')
    return { serverUrl, roomName: lkRoom, token }
  } catch {
    return { serverUrl: roomUrl, roomName: null, token: null }
  }
}

export function LiveKitRoom({ roomName, meeting, room: _room }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const join = useRoomJoinMeeting()
  const [userChoices, setUserChoices] = useState<LocalUserChoices | null>(null)
  const [joined, setJoined] = useState<Meeting | null>(null)
  const [error, setError] = useState<string | null>(null)

  const storageKey = `livekit-username-${roomName}`
  const defaultUsername = (() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(storageKey)
      if (saved) return saved
    }
    return user?.name || user?.email?.split('@')[0] || ''
  })()

  // Call the backend /join endpoint once the PreJoin form is submitted —
  // no point burning a token if the user might back out at the device screen.
  useEffect(() => {
    if (!userChoices) return
    let cancelled = false
    join
      .mutateAsync({
        roomName,
        meetingId: meeting.id,
        displayName: userChoices.username || user?.name || user?.email || undefined,
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
  }, [userChoices, meeting.id, roomName])

  const handlePreJoinSubmit = useCallback(
    (choices: LocalUserChoices) => {
      if (choices.username) {
        try {
          window.localStorage.setItem(storageKey, choices.username)
        } catch {
          // non-fatal
        }
      }
      setUserChoices(choices)
    },
    [storageKey],
  )

  const handleDisconnected = useCallback(() => {
    navigate('/browse')
  }, [navigate])

  if (error) {
    return <RoomError message={error} onLeave={() => navigate('/browse')} />
  }

  if (!userChoices) {
    return (
      <div
        data-lk-theme="default"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--gh-off-black)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PreJoin
          defaults={{
            username: defaultUsername,
            audioEnabled: true,
            videoEnabled: true,
          }}
          onSubmit={handlePreJoinSubmit}
          userLabel="Display name"
        />
      </div>
    )
  }

  if (!joined) return <RoomLoading label="Connecting to meeting…" />

  const { serverUrl, roomName: lkRoomName, token } = parseLiveKitUrl(joined.room_url)

  if (!token || !lkRoomName) {
    return (
      <RoomError
        message={!token ? 'No access token received from server' : 'No room name received from server'}
        onLeave={() => navigate('/browse')}
      />
    )
  }

  return (
    <div
      data-lk-theme="default"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'black',
      }}
    >
      <LKRoom
        serverUrl={serverUrl}
        token={token}
        connect
        audio={userChoices.audioEnabled}
        video={userChoices.videoEnabled}
        onDisconnected={handleDisconnected}
        style={{ height: '100%' }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LKRoom>
    </div>
  )
}
