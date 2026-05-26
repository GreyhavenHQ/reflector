import { useEffect, useRef, useState } from 'react'
import { apiClient } from '@/api/client'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'failed'

/**
 * Opens a WebRTC audio-only peer to `/v1/transcripts/{id}/record/webrtc`.
 * Uses vanilla RTCPeerConnection (no simple-peer dep) with a single non-trickle
 * offer/answer exchange: wait for ICE gathering complete, POST the offer,
 * set the answer. Matches the signaling the www client does with simple-peer.
 *
 * Usage:
 *   const { state, error } = useWebRTC(stream, transcriptId)
 *
 * When either `stream` or `transcriptId` is null the hook is inert.
 */
export function useWebRTC(
  stream: MediaStream | null,
  transcriptId: string | null,
) {
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<Error | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)

  useEffect(() => {
    if (!stream || !transcriptId) return
    let cancelled = false
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    pcRef.current = pc
    setState('connecting')
    setError(null)

    // Force sendrecv on the audio m= section. Browsers can default to
    // sendonly when you only addTrack() without an explicit intent to
    // receive; aiortc then never pulls frames from its wrapper track. Using
    // addTransceiver with direction: 'sendrecv' and attaching our own track
    // to that sender matches simple-peer's behavior and keeps the pipeline
    // wired up.
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      setError(new Error('No audio tracks on the stream'))
      setState('failed')
      return
    }
    audioTracks.forEach((track) => {
      const transceiver = pc.addTransceiver(track, {
        direction: 'sendrecv',
        streams: [stream],
      })
      transceiver.direction = 'sendrecv'
    })

    pc.oniceconnectionstatechange = () => {
      if (cancelled) return
      const s = pc.iceConnectionState
      if (s === 'connected' || s === 'completed') setState('connected')
      else if (s === 'failed') setState('failed')
      else if (s === 'closed' || s === 'disconnected') setState('closed')
    }

    const exchange = async () => {
      try {
        // Default bidirectional offer. The backend wraps our incoming track
        // in an outgoing AudioStreamTrack (server-side rtc_offer.py on_track
        // handler) and relies on an active SDP sender lane to pull frames
        // via `track.recv()`. Forcing `offerToReceiveAudio: false` makes the
        // offer sendonly, the answer recvonly, and aiortc never pulls frames
        // — so the pipeline stays silent. Matches simple-peer defaults.
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await waitIceGatheringComplete(pc)
        if (cancelled) return

        const local = pc.localDescription
        if (!local) throw new Error('No local description after ICE gather')

        const { data, response } = await apiClient.POST(
          '/v1/transcripts/{transcript_id}/record/webrtc',
          {
            params: { path: { transcript_id: transcriptId } },
            body: { sdp: local.sdp, type: local.type } as never,
          },
        )
        if (!response.ok || !data) {
          throw new Error(`WebRTC signaling failed (${response.status})`)
        }
        if (cancelled) return
        const answer = data as { sdp: string; type: RTCSdpType }
        await pc.setRemoteDescription(answer)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error('WebRTC setup failed'))
        setState('failed')
      }
    }
    void exchange()

    return () => {
      cancelled = true
      try {
        pc.getSenders().forEach((s) => {
          try {
            s.track?.stop()
          } catch {
            // ignore
          }
        })
        pc.close()
      } catch {
        // ignore
      }
      if (pcRef.current === pc) pcRef.current = null
    }
  }, [stream, transcriptId])

  return { state, error }
}

function waitIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', check)
    // Safety timeout: some browsers never flip to "complete". Give it 3 s.
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }, 3000)
  })
}
