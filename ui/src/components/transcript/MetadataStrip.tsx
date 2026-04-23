import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { fmtDate, fmtDur } from '@/lib/format'

type Transcript = components['schemas']['GetTranscriptWithParticipants']

type Props = {
  transcript: Transcript
  speakerCount: number
}

function sourceLabel(t: Transcript): string {
  if (t.source_kind === 'room') return t.room_name || 'room'
  if (t.source_kind === 'live') return 'live'
  return 'upload'
}

function toSeconds(value: number | null | undefined) {
  if (!value) return 0
  // Backend persists duration in ms in the `duration` column (see file_pipeline.py).
  return Math.round(value / 1000)
}

function Dot() {
  return <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
}

export function MetadataStrip({ transcript, speakerCount }: Props) {
  const src = transcript.source_language ?? ''
  const tgt = transcript.target_language ?? null
  const shortId = transcript.id.slice(0, 8)
  const duration = toSeconds(transcript.duration)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 2,
        fontSize: 11.5,
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>#{shortId}</span>
      <Dot />
      <span>{sourceLabel(transcript)}</span>
      <Dot />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {fmtDate(transcript.created_at)}
      </span>
      <Dot />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {fmtDur(duration)}
      </span>
      {speakerCount > 0 && (
        <>
          <Dot />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {I.Users(11)} {speakerCount} {speakerCount === 1 ? 'speaker' : 'speakers'}
          </span>
        </>
      )}
      {src && (
        <>
          <Dot />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: tgt && tgt !== src ? 'var(--primary)' : 'var(--fg-muted)',
            }}
          >
            {I.Globe(11)}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                textTransform: 'uppercase',
              }}
            >
              {src}
              {tgt && tgt !== src && <> → {tgt}</>}
            </span>
          </span>
        </>
      )}
      {transcript.room_name && (
        <>
          <Dot />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {I.Door(11)} {transcript.room_name}
          </span>
        </>
      )}
    </div>
  )
}
