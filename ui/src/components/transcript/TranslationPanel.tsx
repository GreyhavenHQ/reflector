import type { components } from '@/api/schema'
import { fmtDur } from '@/lib/format'

type Topic = components['schemas']['GetTranscriptTopic']
type Segment = components['schemas']['GetTranscriptSegmentTopic']
type Participant = components['schemas']['Participant']

type Props = {
  topics: Topic[]
  participants: Participant[]
  onSeek: (seconds: number) => void
  /** Indicates translation was requested for this transcript. Drives the
   *  empty-state copy when no segments carry a translation yet. */
  hasTranslationRequest: boolean
}

/**
 * Body-only translated-transcript view. Mirrors TopicsList but renders
 * only the translation per segment (skipping segments that don't have
 * one). Used as the "Translation" tab content next to the summary.
 */
export function TranslationPanel({
  topics,
  participants,
  onSeek,
  hasTranslationRequest,
}: Props) {
  const renderable = topics
    .map((t) => ({
      topic: t,
      segments: (t.segments ?? []).filter((s): s is Segment & { translation: string } =>
        Boolean(s.translation && s.translation.trim()),
      ),
    }))
    .filter(({ segments }) => segments.length > 0)

  if (renderable.length === 0) {
    return (
      <div className="text-[13px] text-fg-muted italic">
        {hasTranslationRequest
          ? 'Translation will appear here once processing finishes.'
          : 'No translation available for this transcript.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {renderable.map(({ topic, segments }) => (
        <div key={topic.id} className="flex flex-col gap-2.5">
          {topic.title && (
            <div className="font-serif text-[15px] font-semibold tracking-[-0.005em] text-fg">
              {topic.title}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {segments.map((s, i) => (
              <TranslatedSegment
                key={`${topic.id}-${i}`}
                segment={s}
                participants={participants}
                onSeek={onSeek}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TranslatedSegment({
  segment,
  participants,
  onSeek,
}: {
  segment: Segment & { translation: string }
  participants: Participant[]
  onSeek: (seconds: number) => void
}) {
  const name = speakerNameFor(segment.speaker, participants)
  return (
    <div className="flex items-start gap-2.5">
      <button
        onClick={() => onSeek(segment.start)}
        title="Seek to this moment"
        className="font-mono text-[11px] text-fg-muted bg-transparent border-none cursor-pointer p-0 min-w-[44px] text-left shrink-0"
      >
        {fmtTimestamp(segment.start)}
      </button>
      <span className="font-semibold shrink-0 text-fg-muted text-[13px]">
        {name}:
      </span>
      <span className="flex-1 min-w-0 text-[13.5px] leading-[1.55] text-fg">
        {segment.translation}
      </span>
    </div>
  )
}

function speakerNameFor(speaker: number, participants: Participant[]): string {
  const found = participants.find((p) => p.speaker === speaker)
  return found?.name?.trim() || `Speaker ${speaker}`
}

function fmtTimestamp(seconds: number): string {
  return fmtDur(Math.floor(seconds))
}
