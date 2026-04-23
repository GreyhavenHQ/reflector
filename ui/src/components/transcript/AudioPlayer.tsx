import { useEffect, useRef, useState } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { apiClient } from '@/api/client'
import { fmtDur } from '@/lib/format'
import { WaveformCanvas } from './WaveformCanvas'

type Props = {
  transcriptId: string
  peaks: number[] | null | undefined
  ticks?: number[]
  /** Seconds. When set, the player seeks to this time. */
  seekTarget?: { seconds: number; nonce: number } | null
  onTimeUpdate?: (currentSeconds: number) => void
  onDuration?: (seconds: number) => void
}

/**
 * Authed audio playback for a transcript. We fetch the MP3 through the API
 * client (so the Authorization header lands) and attach the blob URL to a
 * native <audio> element. Limitation: loads the full file upfront, so this is
 * fine for typical meetings. Upgrade to a service worker if the backend starts
 * serving hour-long recordings.
 */
export function AudioPlayer({
  transcriptId,
  peaks,
  ticks,
  seekTarget,
  onTimeUpdate,
  onDuration,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        // openapi-fetch will attach the Authorization header from our middleware.
        // We use parseAs "stream" to get the raw Response, then read as a Blob.
        const { response } = await apiClient.GET(
          '/v1/transcripts/{transcript_id}/audio/mp3',
          {
            params: { path: { transcript_id: transcriptId } },
            parseAs: 'stream',
          },
        )
        if (!response.ok) throw new Error(`Audio fetch failed (${response.status})`)
        const blob = await response.blob()
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load audio')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [transcriptId])

  useEffect(() => {
    if (!seekTarget || !audioRef.current || !duration) return
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(duration - 0.05, seekTarget.seconds),
    )
  }, [seekTarget, duration])

  // Keyboard: space toggles play/pause unless focus is in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      e.preventDefault()
      const a = audioRef.current
      if (!a) return
      if (a.paused) a.play()
      else a.pause()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleSeekRatio = (ratio: number) => {
    const a = audioRef.current
    if (!a || !duration) return
    a.currentTime = ratio * duration
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <Button
        variant="primary"
        size="icon"
        onClick={() => {
          const a = audioRef.current
          if (!a) return
          if (a.paused) a.play()
          else a.pause()
        }}
        disabled={loading || !!error}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? (
          <span
            style={{
              display: 'inline-flex',
              gap: 3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ width: 3, height: 12, background: 'currentColor' }} />
            <span style={{ width: 3, height: 12, background: 'currentColor' }} />
          </span>
        ) : (
          <span
            style={{
              width: 0,
              height: 0,
              borderLeft: '10px solid currentColor',
              borderTop: '7px solid transparent',
              borderBottom: '7px solid transparent',
              marginLeft: 2,
            }}
          />
        )}
      </Button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Loading audio…</div>
        ) : error ? (
          <div
            style={{
              color: 'var(--destructive)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {I.AlertTriangle(12)} {error}
          </div>
        ) : (
          <WaveformCanvas
            peaks={peaks}
            progress={duration ? currentTime / duration : 0}
            onSeek={handleSeekRatio}
            ticks={ticks}
            duration={duration}
          />
        )}
      </div>

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--fg-muted)',
          minWidth: 88,
          textAlign: 'right',
        }}
      >
        {fmtDur(Math.floor(currentTime))} / {fmtDur(Math.floor(duration))}
      </span>

      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="metadata"
          style={{ display: 'none' }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            setDuration(d)
            onDuration?.(d)
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime
            setCurrentTime(t)
            onTimeUpdate?.(t)
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  )
}
