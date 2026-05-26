import { useMemo } from 'react'
import { MinimalHeader } from '@/components/layout/MinimalHeader'
import { Button } from '@/components/ui/primitives'
import { I } from '@/components/icons'
import { fmtDate } from '@/lib/format'
import type { Meeting } from '@/hooks/useRoomMeetings'

type Props = {
  roomName: string
  meetings: Meeting[]
  loading: boolean
  creating: boolean
  onSelect: (meeting: Meeting) => void
  onCreateUnscheduled: () => void
}

/**
 * For ICS-enabled rooms — let the user pick between currently-happening
 * meetings, upcoming scheduled meetings, or start an unscheduled one.
 */
export function MeetingSelection({
  roomName,
  meetings,
  loading,
  creating,
  onSelect,
  onCreateUnscheduled,
}: Props) {
  const { current, upcoming } = useMemo(() => {
    const now = Date.now()
    const curr: Meeting[] = []
    const up: Meeting[] = []
    for (const m of meetings) {
      const start = new Date(m.start_date).getTime()
      const end = new Date(m.end_date).getTime()
      if (now >= start && now <= end) curr.push(m)
      else if (now < start) up.push(m)
    }
    up.sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
    )
    return { current: curr, upcoming: up }
  }, [meetings])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      <MinimalHeader title={roomName} crumb={['room']} />
      <main
        style={{
          flex: 1,
          padding: 24,
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <header>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--fg)',
            }}
          >
            {roomName}
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13,
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.5,
            }}
          >
            Join an active meeting or start an unscheduled one.
          </p>
        </header>

        {loading && <MeetingListSkeleton />}

        {!loading && current.length > 0 && (
          <Section label="In progress">
            {current.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                accent
                ctaLabel="Join now"
                onSelect={() => onSelect(m)}
              />
            ))}
          </Section>
        )}

        {!loading && upcoming.length > 0 && (
          <Section label="Upcoming">
            {upcoming.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                ctaLabel="Join"
                onSelect={() => onSelect(m)}
              />
            ))}
          </Section>
        )}

        {!loading && current.length === 0 && upcoming.length === 0 && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-sans)',
              fontStyle: 'italic',
            }}
          >
            No active or upcoming meetings on the calendar right now.
          </p>
        )}

        <div
          style={{
            marginTop: 8,
            paddingTop: 20,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--fg)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Need a quick call?
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Spin up an unscheduled meeting in this room.
            </div>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={onCreateUnscheduled}
            disabled={creating}
          >
            {I.Plus(13)} {creating ? 'Starting…' : 'Start meeting'}
          </Button>
        </div>
      </main>
    </div>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--fg-muted)',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  )
}

function MeetingCard({
  meeting,
  ctaLabel,
  accent,
  onSelect,
}: {
  meeting: Meeting
  ctaLabel: string
  accent?: boolean
  onSelect: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--card)',
        border: '1px solid',
        borderColor: accent ? 'var(--primary)' : 'var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: accent ? 'var(--shadow-xs)' : 'none',
      }}
    >
      {accent && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--status-live)',
            boxShadow:
              '0 0 0 4px color-mix(in srgb, var(--status-live) 25%, transparent)',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13.5,
            fontWeight: 500,
            color: 'var(--fg)',
          }}
        >
          {fmtDate(meeting.start_date)}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-muted)',
          }}
        >
          {new Date(meeting.start_date).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          –{' '}
          {new Date(meeting.end_date).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
      <Button variant={accent ? 'primary' : 'outline'} size="sm" onClick={onSelect}>
        {ctaLabel}
      </Button>
    </div>
  )
}

function MeetingListSkeleton() {
  return (
    <div
      style={{
        color: 'var(--fg-muted)',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        textAlign: 'center',
        padding: 32,
      }}
    >
      Loading meetings…
    </div>
  )
}
