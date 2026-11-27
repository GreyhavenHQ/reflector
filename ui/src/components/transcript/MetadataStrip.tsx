import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { cn } from '@/lib/utils'
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
  return <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
}

export function MetadataStrip({ transcript, speakerCount }: Props) {
  const src = transcript.source_language ?? ''
  const tgt = transcript.target_language ?? null
  const shortId = transcript.id.slice(0, 8)
  const duration = toSeconds(transcript.duration)
  return (
    <div className="flex items-center flex-wrap gap-y-0.5 text-[11.5px] text-fg-muted font-sans">
      <span className="font-mono text-[11px]">#{shortId}</span>
      <Dot />
      <span>{sourceLabel(transcript)}</span>
      <Dot />
      <span className="font-mono text-[11px]">{fmtDate(transcript.created_at)}</span>
      <Dot />
      <span className="font-mono text-[11px]">{fmtDur(duration)}</span>
      {speakerCount > 0 && (
        <>
          <Dot />
          <span className="inline-flex items-center gap-1">
            {I.Users(11)} {speakerCount} {speakerCount === 1 ? 'speaker' : 'speakers'}
          </span>
        </>
      )}
      {src && (
        <>
          <Dot />
          <span
            className={cn(
              'inline-flex items-center gap-1',
              tgt && tgt !== src ? 'text-primary' : 'text-fg-muted',
            )}
          >
            {I.Globe(11)}
            <span className="font-mono text-[10.5px] uppercase">
              {src}
              {tgt && tgt !== src && <> → {tgt}</>}
            </span>
          </span>
        </>
      )}
      {transcript.room_name && (
        <>
          <Dot />
          <span className="inline-flex items-center gap-1">
            {I.Door(11)} {transcript.room_name}
          </span>
        </>
      )}
    </div>
  )
}
