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
    <div className="flex flex-col min-h-screen bg-bg">
      <MinimalHeader title={roomName} crumb={['room']} />
      <main className="flex-1 p-6 max-w-[720px] w-full mx-auto box-border flex flex-col gap-5">
        <header>
          <h1 className="m-0 font-serif text-2xl font-semibold tracking-[-0.02em] text-fg">
            {roomName}
          </h1>
          <p className="mt-1.5 mb-0 text-[13px] text-fg-muted font-sans leading-[1.5]">
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
          <p className="m-0 text-[13px] text-fg-muted font-sans italic">
            No active or upcoming meetings on the calendar right now.
          </p>
        )}

        <div className="mt-2 pt-5 border-t border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-fg font-sans">
              Need a quick call?
            </div>
            <div className="text-xs text-fg-muted font-sans">
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
    <div className="flex flex-col gap-2">
      <div className="font-sans text-[11px] font-semibold tracking-[0.04em] uppercase text-fg-muted">
        {label}
      </div>
      <div className="flex flex-col gap-2">
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
      className={
        accent
          ? 'flex items-center gap-3 px-4 py-3 bg-card border border-primary rounded-md shadow-xs'
          : 'flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-md'
      }
    >
      {accent && (
        <span className="w-2 h-2 rounded-full bg-status-live shrink-0 shadow-[0_0_0_4px_color-mix(in_srgb,var(--status-live)_25%,transparent)]" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-sans text-[13.5px] font-medium text-fg">
          {fmtDate(meeting.start_date)}
        </div>
        <div className="font-mono text-[11px] text-fg-muted">
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
    <div className="text-fg-muted text-[13px] font-sans text-center p-8">
      Loading meetings…
    </div>
  )
}
