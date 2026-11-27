import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DailyIframe, {
  type DailyCall,
  type DailyFactoryOptions,
} from '@daily-co/daily-js'
import { apiClient } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { useRoomJoinMeeting, type Meeting, type RoomDetails } from '@/hooks/useRoomMeetings'
import { RoomError, RoomLoading } from './roomChrome'

type Props = {
  roomName: string
  meeting: Meeting
  room: RoomDetails
}

const RECORDING_START_DELAY_MS = 2000
const RECORDING_START_MAX_RETRIES = 5
// UUIDv5 namespace used by www so raw-tracks instanceIds are deterministic
// across participants. Hashing the meeting id against this namespace yields
// the same UUID for every participant joining the same meeting.
const RAW_TRACKS_NAMESPACE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

/**
 * Daily room using Daily's prebuilt-iframe SDK. On `joined-meeting`, we
 * fire the backend's `/recordings/start` endpoint to kick raw-tracks (for
 * transcription) and optionally cloud (for video storage). Retries on 404
 * because Daily takes a beat to register the call as "hosting" after join.
 */
export function DailyRoom({ roomName, meeting, room: _room }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const join = useRoomJoinMeeting()
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Exchange our API meeting for the tokenized Daily URL.
  useEffect(() => {
    let cancelled = false
    join
      .mutateAsync({
        roomName,
        meetingId: meeting.id,
        displayName: user?.name ?? user?.email ?? undefined,
      })
      .then((m) => {
        if (!cancelled) setUrl(m.room_url)
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

  const handleLeave = useCallback(() => {
    navigate('/browse')
  }, [navigate])

  const startRecording = useCallback(
    async (type: 'cloud' | 'raw-tracks', instanceId: string, attempt = 1) => {
      try {
        const { response } = await apiClient.POST(
          '/v1/meetings/{meeting_id}/recordings/start',
          {
            params: { path: { meeting_id: meeting.id } },
            body: { type, instanceId },
          },
        )
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          const notHosting = text.includes('does not seem to be hosting a call')
          const activeStream = text.includes('has an active stream')
          if (notHosting && attempt < RECORDING_START_MAX_RETRIES) {
            setTimeout(
              () => void startRecording(type, instanceId, attempt + 1),
              RECORDING_START_DELAY_MS,
            )
            return
          }
          if (!activeStream) {
            console.error(`Failed to start ${type} recording (${response.status})`)
          }
        }
      } catch (err) {
        console.error(`Failed to start ${type} recording:`, err)
      }
    },
    [meeting.id],
  )

  const handleJoinedMeeting = useCallback(async () => {
    if (meeting.recording_type !== 'cloud') return
    // Raw-tracks: required for the transcription pipeline. Cloud: only if
    // the room opts in to store the composed video.
    const rawId = await deriveUuidV5(meeting.id, RAW_TRACKS_NAMESPACE)
    setTimeout(
      () => void startRecording('raw-tracks', rawId),
      RECORDING_START_DELAY_MS,
    )
    if (meeting.store_video) {
      setTimeout(
        () => void startRecording('cloud', meeting.id),
        RECORDING_START_DELAY_MS,
      )
    }
  }, [meeting.id, meeting.recording_type, meeting.store_video, startRecording])

  useEffect(() => {
    if (!container || !url) return
    let frame: DailyCall | null = null
    const init = async () => {
      const existing = DailyIframe.getCallInstance()
      if (existing) {
        try {
          await existing.destroy()
        } catch {
          // ignore
        }
      }
      const opts: DailyFactoryOptions = {
        iframeStyle: { width: '100%', height: '100%', border: 'none' },
        showLeaveButton: true,
        showFullscreenButton: true,
      }
      frame = DailyIframe.createFrame(container, opts)
      frame.on('left-meeting', handleLeave)
      frame.on('joined-meeting', () => {
        void handleJoinedMeeting()
      })
      try {
        await frame.join({
          url,
          sendSettings: {
            video: { allowAdaptiveLayers: true, maxQuality: 'medium' },
          },
        })
      } catch (err) {
        console.error('Daily join failed:', err)
        setError(err instanceof Error ? err.message : 'Daily join failed')
      }
    }
    void init()
    return () => {
      frame?.destroy().catch(() => undefined)
    }
  }, [container, url, handleLeave, handleJoinedMeeting])

  if (error) return <RoomError message={error} onLeave={handleLeave} />
  if (!url) return <RoomLoading label="Joining meeting…" />

  return (
    <div
      ref={setContainer}
      className="fixed inset-0 bg-[var(--gh-off-black)]"
    />
  )
}

async function deriveUuidV5(value: string, namespace: string): Promise<string> {
  // Web Crypto SHA-1 implementation of UUIDv5 (RFC 4122) so raw-tracks
  // instanceIds stay deterministic across participants — matches the
  // react-uuid-hook behaviour www relies on.
  const ns = uuidToBytes(namespace)
  const data = new TextEncoder().encode(value)
  const buf = new Uint8Array(ns.length + data.length)
  buf.set(ns, 0)
  buf.set(data, ns.length)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', buf))
  hash[6] = (hash[6] & 0x0f) | 0x50 // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80 // RFC 4122 variant
  return bytesToUuid(hash.slice(0, 16))
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToUuid(bytes: Uint8Array): string {
  const h = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}
