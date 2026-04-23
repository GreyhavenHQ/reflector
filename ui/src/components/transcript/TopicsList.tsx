import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
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
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--fg-muted)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
        }}
      >
        No topics yet.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
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
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'transparent',
      }}
    >
      <button
        onClick={() => {
          onSeek(started)
          setOpen((v) => !v)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          background: highlight ? 'var(--accent)' : 'var(--muted)',
          border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg)',
          transition: 'background var(--dur-fast) var(--ease-default)',
        }}
      >
        <span
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform var(--dur-fast)',
            color: 'var(--fg-muted)',
            display: 'inline-flex',
          }}
        >
          {I.ChevronRight(14)}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {topic.title}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-muted)',
          }}
        >
          {fmtTimestamp(started)}
          {topic.duration && topic.duration > 0 ? ` · ${fmtDur(Math.floor(topic.duration))}` : ''}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: '14px 20px 18px 46px',
            fontFamily: 'var(--font-sans)',
            fontSize: 13.5,
            lineHeight: 1.55,
            color: 'var(--fg)',
            background: 'var(--card)',
          }}
        >
          {topic.summary?.trim() && (
            <div
              style={{
                fontStyle: 'italic',
                color: 'var(--fg-muted)',
                marginBottom: 12,
                paddingLeft: 10,
                borderLeft: '2px solid var(--border)',
              }}
            >
              {topic.summary}
            </div>
          )}
          {segments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            <div style={{ whiteSpace: 'pre-wrap' }}>{topic.transcript}</div>
          ) : (
            <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>No transcript.</div>
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
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <button
        onClick={() => onSeek(segment.start)}
        title="Seek to this moment"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--fg-muted)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          minWidth: 44,
          textAlign: 'left',
        }}
      >
        {fmtTimestamp(segment.start)}
      </button>
      <span
        style={{
          fontWeight: 600,
          color,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {name}:
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{segment.text}</span>
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
