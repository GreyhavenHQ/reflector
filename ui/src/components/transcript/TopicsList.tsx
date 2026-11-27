import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { cn } from '@/lib/utils'
import { fmtDur } from '@/lib/format'

type Topic = components['schemas']['GetTranscriptTopic']
type Segment = components['schemas']['GetTranscriptSegmentTopic']
type Participant = components['schemas']['Participant']

type Props = {
  topics: Topic[]
  participants: Participant[]
  activeTopicId: string | null
  currentTime: number
  onSeek: (seconds: number) => void
}

export function TopicsList({
  topics,
  participants,
  activeTopicId,
  currentTime,
  onSeek,
}: Props) {
  if (topics.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-fg-muted font-sans text-[13px]">
        No topics yet.
      </div>
    )
  }
  return (
    <div className="flex flex-col">
      {topics.map((t, i) => (
        <TopicItem
          key={t.id ?? i}
          topic={t}
          participants={participants}
          active={activeTopicId === t.id}
          defaultExpanded={i === 0 || activeTopicId === t.id}
          currentTime={currentTime}
          onSeek={onSeek}
        />
      ))}
    </div>
  )
}

type ItemProps = {
  topic: Topic
  participants: Participant[]
  active: boolean
  defaultExpanded: boolean
  currentTime: number
  onSeek: (seconds: number) => void
}

function TopicItem({
  topic,
  participants,
  active,
  defaultExpanded,
  currentTime,
  onSeek,
}: ItemProps) {
  const [open, setOpen] = useState(defaultExpanded)
  const ref = useRef<HTMLDivElement>(null)

  // Auto-scroll the active topic into view.
  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [active])

  const segments: Segment[] = topic.segments ?? []
  const started = topic.timestamp ?? 0
  const end = started + (topic.duration ?? 0)
  const inWindow = currentTime >= started && currentTime < end

  const highlight = active || inWindow
  return (
    <div
      ref={ref}
      data-active={highlight ? 'true' : undefined}
      className="border-b border-border bg-transparent"
    >
      <button
        onClick={() => {
          onSeek(started)
          setOpen((v) => !v)
        }}
        className={cn(
          'w-full flex items-center gap-3 px-5 py-3.5 border-none cursor-pointer text-left font-sans text-fg transition-[background] duration-[var(--dur-fast)] ease-[var(--ease-default)]',
          highlight ? 'bg-accent' : 'bg-muted',
          open ? 'border-b border-border' : '',
        )}
      >
        <span
          className={cn(
            'transition-transform duration-[var(--dur-fast)] text-fg-muted inline-flex',
            open ? 'rotate-90' : 'rotate-0',
          )}
        >
          {I.ChevronRight(14)}
        </span>
        <span className="flex-1 min-w-0 font-serif text-[15px] font-semibold tracking-[-0.005em] text-fg whitespace-nowrap overflow-hidden text-ellipsis">
          {topic.title}
        </span>
        <span className="font-mono text-[11px] text-fg-muted">
          {fmtTimestamp(started)}
          {topic.duration && topic.duration > 0 ? ` · ${fmtDur(Math.floor(topic.duration))}` : ''}
        </span>
      </button>

      {open && (
        <div className="pt-3.5 pr-5 pb-[18px] pl-[46px] font-sans text-[13.5px] leading-[1.55] text-fg bg-card">
          {topic.summary?.trim() && (
            <div className="italic text-fg-muted mb-3 pl-2.5 border-l-2 border-border">
              {topic.summary}
            </div>
          )}
          {segments.length > 0 ? (
            <div className="flex flex-col gap-2">
              {segments.map((seg, i) => (
                <TopicSegment
                  key={i}
                  segment={seg}
                  participants={participants}
                  onSeek={onSeek}
                />
              ))}
            </div>
          ) : topic.transcript?.trim() ? (
            <div className="whitespace-pre-wrap">{topic.transcript}</div>
          ) : (
            <div className="text-fg-muted text-xs">No transcript.</div>
          )}
        </div>
      )}
    </div>
  )
}

function TopicSegment({
  segment,
  participants,
  onSeek,
}: {
  segment: Segment
  participants: Participant[]
  onSeek: (seconds: number) => void
}) {
  const name = speakerNameFor(segment.speaker, participants)
  const color = speakerColor(segment.speaker, Math.max(participants.length, 1))
  return (
    <div className="flex items-start gap-2.5">
      <button
        onClick={() => onSeek(segment.start)}
        title="Seek to this moment"
        className="font-mono text-[11px] text-fg-muted bg-transparent border-none cursor-pointer p-0 min-w-[44px] text-left"
      >
        {fmtTimestamp(segment.start)}
      </button>
      <span
        className="font-semibold shrink-0 min-w-0"
        style={{ color }}
      >
        {name}:
      </span>
      <div className="flex-1 min-w-0">
        <div>{segment.text}</div>
        {segment.translation && (
          <div className="text-fg-muted italic text-sm mt-0.5">
            {segment.translation}
          </div>
        )}
      </div>
    </div>
  )
}

function speakerNameFor(speaker: number, participants: Participant[]): string {
  const found = participants.find((p) => p.speaker === speaker)
  return found?.name?.trim() || `Speaker ${speaker}`
}

// Evenly distribute N speakers along an orange→green hue arc (passing
// through yellow/olive). The lightness alternates between two steps so
// adjacent speakers stay distinguishable even at high counts (20+ speakers):
// in a ~110° arc with 30 entries each hue step is ~3.5°, which is hard to
// read on its own — pairing it with a lightness flip effectively doubles the
// perceptual separation without breaking the tonal family.
function speakerColor(speaker: number, total: number): string {
  const count = Math.max(total, 1)
  const arcStart = 20 // orange
  const arcEnd = 130 // green
  const t = count === 1 ? 0.5 : (speaker % count) / (count - 1)
  const hue = arcStart + t * (arcEnd - arcStart)
  const lightness = speaker % 2 === 0 ? 40 : 48
  return `hsl(${Math.round(hue)} 55% ${lightness}%)`
}

function fmtTimestamp(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m < 60) return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const h = Math.floor(m / 60)
  return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
