import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { MinimalHeader } from '@/components/layout/MinimalHeader'
import { LiveLevelMeter } from '@/components/record/LiveLevelMeter'
import { Button } from '@/components/ui/primitives'
import { I } from '@/components/icons'
import { cn } from '@/lib/utils'
import { fmtDur } from '@/lib/format'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useWebRTC } from '@/hooks/useWebRTC'
import {
  useTranscript,
  useTranscriptMutations,
} from '@/hooks/useTranscript'
import { useTranscriptWs } from '@/hooks/useTranscriptWs'

export function RecordPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    permission,
    devices,
    request: requestMic,
    getStream,
  } = useAudioDevices()

  const [phase, setPhase] = useState<
    'idle' | 'connecting' | 'recording' | 'stopping'
  >('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [elapsed, setElapsed] = useState(0)
  const [accumulatedText, setAccumulatedText] = useState('')
  const [accumulatedTranslation, setAccumulatedTranslation] = useState('')
  const startedAtRef = useRef<number | null>(null)

  const transcriptQuery = useTranscript(id)
  const transcript = transcriptQuery.data
  const { softDelete } = useTranscriptMutations(id)

  // Default to the first available device once the list populates.
  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].deviceId)
  }, [devices, deviceId])

  // Bounce if the transcript already moved past `idle` (refresh after stop,
  // etc.) so users don't end up on a stale record page.
  useEffect(() => {
    const status = transcript?.status
    if (!status || !id) return
    if (status !== 'idle' && status !== 'recording') {
      navigate(`/transcripts/${id}`, { replace: true })
    }
  }, [transcript?.status, id, navigate])

  // Live transcript handler — append incoming TRANSCRIPT events to the
  // running text/translation buffers. Matches www's accumulated-text
  // approach; the right pane only shows up when any translation has landed.
  const appendSegment = useCallback((text: string, translation: string) => {
    if (!text && !translation) return
    if (text.trim()) {
      setAccumulatedText((prev) => (prev ? `${prev} ${text}` : text))
    }
    if (translation.trim()) {
      setAccumulatedTranslation((prev) =>
        prev ? `${prev} ${translation}` : translation,
      )
    }
  }, [])

  // WebSocket subscription starts as soon as we begin negotiating — the
  // pipeline may emit STATUS/TRANSCRIPT events before we flip to `recording`
  // if the backend is fast. Stay quiet in idle/stopping.
  useTranscriptWs(id, {
    enabled: phase === 'connecting' || phase === 'recording',
    onLiveText: appendSegment,
  })

  // Elapsed timer — only starts once the PeerConnection is fully connected.
  useEffect(() => {
    if (phase !== 'recording') return
    startedAtRef.current = Date.now()
    setElapsed(0)
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  // Open the PeerConnection during negotiation AND while recording.
  const webrtcActive = phase === 'connecting' || phase === 'recording'
  const webrtc = useWebRTC(stream, webrtcActive ? (id ?? null) : null)

  // Drive phase transitions off the PC state, so the UI doesn't say "Live"
  // until the stream is actually flowing.
  useEffect(() => {
    if (phase === 'connecting' && webrtc.state === 'connected') {
      setPhase('recording')
    }
    if (
      (phase === 'connecting' || phase === 'recording') &&
      webrtc.state === 'failed'
    ) {
      toast.error(webrtc.error?.message ?? 'WebRTC connection failed')
      setPhase('idle')
    }
  }, [phase, webrtc.state, webrtc.error])

  // Track the underlying source streams + AudioContext when we're mixing
  // (screen + mic), so stop/cancel can fully tear them down. Without this,
  // the destination stream's tracks stop but the tab-capture indicator
  // stays up because we never stopped the screen tracks.
  const sourcesRef = useRef<{
    mic?: MediaStream
    screen?: MediaStream
    ctx?: AudioContext
  }>({})

  const teardownAudio = () => {
    const { mic, screen, ctx } = sourcesRef.current
    sourcesRef.current = {}
    mic?.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    screen?.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => undefined)
    }
  }

  const beginWithStream = (s: MediaStream) => {
    setStream(s)
    setAccumulatedText('')
    setAccumulatedTranslation('')
    setPhase('connecting')
  }

  const startRecording = async () => {
    if (!deviceId && permission !== 'granted') {
      const ok = await requestMic()
      if (!ok) {
        toast.error('Microphone access denied.')
        return
      }
    }
    try {
      const s = await getStream(deviceId || undefined)
      sourcesRef.current = { mic: s }
      beginWithStream(s)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the microphone.')
    }
  }

  const startRecordingWithTabAudio = async () => {
    if (permission !== 'granted') {
      const ok = await requestMic()
      if (!ok) {
        toast.error('Microphone access denied.')
        return
      }
    }
    let screen: MediaStream | null = null
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })
    } catch {
      // User cancelled the picker — not an error, just bail silently.
      return
    }
    if (screen.getAudioTracks().length === 0) {
      toast.error(
        'No audio track found. Pick "Share tab audio" in the screen-share dialog.',
      )
      screen.getTracks().forEach((t) => t.stop())
      return
    }
    let mic: MediaStream
    try {
      mic = await getStream(deviceId || undefined)
    } catch (err) {
      screen.getTracks().forEach((t) => t.stop())
      toast.error(err instanceof Error ? err.message : 'Could not open the mic.')
      return
    }

    // Merge mic + tab audio through Web Audio into a single stream so the
    // backend sees one mono track. Matches www's channelMerger approach
    // (mismatched channel counts break WebRTC in some browsers).
    const ctx = new AudioContext()
    const micSource = ctx.createMediaStreamSource(mic)
    const tabSource = ctx.createMediaStreamSource(screen)
    const merger = ctx.createChannelMerger(1)
    micSource.connect(merger, 0, 0)
    tabSource.connect(merger, 0, 0)
    const dest = ctx.createMediaStreamDestination()
    merger.connect(dest)

    sourcesRef.current = { mic, screen, ctx }
    beginWithStream(dest.stream)
  }

  const stopRecording = () => {
    setPhase('stopping')
    const s = stream
    setStream(null)
    s?.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    teardownAudio()
    // Give the backend a beat to finalize the last chunk, then navigate.
    setTimeout(() => {
      if (id) navigate(`/transcripts/${id}`, { replace: true })
    }, 600)
  }

  const cancelAndDiscard = async () => {
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })
      setStream(null)
    }
    teardownAudio()
    setPhase('idle')
    try {
      await softDelete.mutateAsync()
    } catch {
      // non-fatal
    }
    navigate('/browse', { replace: true })
  }

  const headerTitle = (() => {
    if (phase === 'recording') return 'Recording…'
    if (phase === 'connecting') return 'Connecting…'
    if (phase === 'stopping') return 'Saving…'
    return 'New recording'
  })()

  const headerActions = (() => {
    if (phase === 'recording') {
      return (
        <Button variant="danger" size="sm" onClick={stopRecording}>
          {I.X(14)} Stop
        </Button>
      )
    }
    if (phase === 'connecting') {
      return (
        <Button variant="ghost" size="sm" onClick={() => void cancelAndDiscard()}>
          Cancel
        </Button>
      )
    }
    if (phase === 'idle') {
      return (
        <Button variant="ghost" size="sm" onClick={() => void cancelAndDiscard()}>
          Cancel
        </Button>
      )
    }
    return null
  })()

  const header = (
    <MinimalHeader
      title={headerTitle}
      crumb={['browse', 'record']}
      actions={headerActions}
    />
  )

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      {header}

      <main className="flex-1 p-6 flex flex-col gap-4 w-full box-border">
        {phase === 'idle' ? (
          <IdlePanel
            permission={permission}
            devices={devices}
            deviceId={deviceId}
            onDeviceId={setDeviceId}
            onRequest={() => void requestMic()}
            onStart={() => void startRecording()}
            onStartWithTabAudio={() => void startRecordingWithTabAudio()}
          />
        ) : (
          <>
            <RecorderStrip
              stream={stream}
              active={phase === 'recording'}
              elapsed={elapsed}
              connectionState={webrtc.state}
              error={webrtc.error}
            />

            <div
              className={cn(
                'rf-record-grid grid gap-4 flex-1 min-h-0',
                accumulatedTranslation
                  ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
                  : 'grid-cols-[minmax(0,1fr)]',
              )}
            >
              <AccumulatedPane
                label="Live transcript"
                text={accumulatedText}
                placeholder="Live transcript will appear here shortly after you start recording."
              />
              {accumulatedTranslation && (
                <AccumulatedPane
                  label="Translation"
                  text={accumulatedTranslation}
                  placeholder="Translation will appear here as speech is recognised."
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function IdlePanel({
  permission,
  devices,
  deviceId,
  onDeviceId,
  onRequest,
  onStart,
  onStartWithTabAudio,
}: {
  permission: string
  devices: { deviceId: string; label: string }[]
  deviceId: string
  onDeviceId: (id: string) => void
  onRequest: () => void
  onStart: () => void
  onStartWithTabAudio: () => void
}) {
  const needsPrompt = permission !== 'granted'
  // getDisplayMedia with audio only works reliably on Chromium-family.
  // Firefox + Safari support the picker but can't share tab audio as of
  // 2026-04. Hide the option when the browser can't do it — matches www.
  const canShareTabAudio =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    /Chrome|Edg|OPR/.test(navigator.userAgent) &&
    !/Firefox/.test(navigator.userAgent)
  return (
    <section className="bg-card border border-border rounded-lg shadow-xs p-7 max-w-[640px] mx-auto my-10 flex flex-col gap-[18px] font-sans">
      <header>
        <h1 className="m-0 font-serif text-[22px] font-semibold tracking-[-0.02em] text-fg">
          Ready to record
        </h1>
        <p className="mt-1.5 mb-0 text-[13px] text-fg-muted leading-[1.5]">
          Audio streams to the server over WebRTC. Transcription and topics
          appear live while you record.
        </p>
      </header>

      {needsPrompt ? (
        <div className="p-4 bg-muted rounded-md flex items-center gap-3">
          <span className="text-fg-muted">{I.Mic(18)}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-fg">
              Microphone access needed
            </div>
            <div className="text-xs text-fg-muted">
              {permission === 'denied'
                ? "You've denied microphone access. Allow it from your browser settings to continue."
                : 'Grant access to list your input devices.'}
            </div>
          </div>
          {permission !== 'denied' && (
            <Button variant="primary" size="sm" onClick={onRequest}>
              Allow
            </Button>
          )}
        </div>
      ) : (
        <div>
          <label className="rf-label" htmlFor="rf-device">
            {I.Mic(13)} Input device
          </label>
          <select
            id="rf-device"
            className="rf-select mt-1.5"
            value={deviceId}
            onChange={(e) => onDeviceId(e.target.value)}
          >
            {devices.length === 0 ? (
              <option value="">System default</option>
            ) : (
              devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      <div className="flex justify-end gap-2 flex-wrap">
        {canShareTabAudio && (
          <Button
            variant="secondary"
            size="md"
            onClick={onStartWithTabAudio}
            disabled={needsPrompt}
            title="Mix microphone + the audio from a shared tab or window"
          >
            {I.Share(14)} Record with tab audio
          </Button>
        )}
        <Button
          variant="primary"
          size="md"
          onClick={onStart}
          disabled={needsPrompt}
        >
          {I.Mic(14)} Start recording
        </Button>
      </div>
    </section>
  )
}

function RecorderStrip({
  stream,
  active,
  elapsed,
  connectionState,
  error,
}: {
  stream: MediaStream | null
  active: boolean
  elapsed: number
  connectionState: string
  error: Error | null
}) {
  const statusLabel = useMemo(() => {
    if (error) return 'Connection failed'
    if (connectionState === 'connected') return 'Live'
    if (connectionState === 'connecting') return 'Connecting…'
    if (connectionState === 'failed') return 'Disconnected'
    return 'Waiting…'
  }, [connectionState, error])

  const statusColor =
    connectionState === 'connected'
      ? 'var(--status-live)'
      : connectionState === 'failed' || error
        ? 'var(--destructive)'
        : 'var(--status-processing)'

  return (
    <section className="bg-card border border-border rounded-lg shadow-xs p-4 flex items-center gap-4 font-sans">
      <div className="inline-flex items-center gap-2 text-xs text-fg-muted shrink-0 w-[110px]">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: statusColor,
            boxShadow: active
              ? `0 0 0 4px color-mix(in srgb, ${statusColor} 25%, transparent)`
              : undefined,
          }}
        />
        {statusLabel}
      </div>

      <div className="flex-1 min-w-0">
        <LiveLevelMeter stream={stream} active={active} height={48} />
      </div>

      <div className="font-mono text-lg text-fg font-semibold w-20 text-right">
        {fmtDur(elapsed)}
      </div>
    </section>
  )
}

function AccumulatedPane({
  label,
  text,
  placeholder,
}: {
  label: string
  text: string
  placeholder: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Stick to the bottom as text accumulates.
    el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <section className="bg-card border border-border rounded-lg shadow-xs flex flex-col overflow-hidden min-h-[280px]">
      <header className="py-3 px-4 border-b border-border font-sans text-xs font-semibold tracking-[0.04em] uppercase text-fg-muted">
        {label}
      </header>
      <div
        ref={ref}
        className="flex-1 min-h-0 overflow-y-auto py-4 px-[18px] font-sans text-[15px] leading-[1.6] text-fg whitespace-pre-wrap"
      >
        {text ? (
          text
        ) : (
          <div className="text-fg-muted text-[13px] italic">
            {placeholder}
          </div>
        )}
      </div>
    </section>
  )
}
