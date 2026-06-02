import { type ReactNode } from 'react'
import { I } from '@/components/icons'
import { RowMenuTrigger } from '@/components/ui/primitives'
import { fmtDate, fmtDur } from '@/lib/format'
import type { TranscriptRowData } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  t: TranscriptRowData
  active?: boolean
  onSelect?: (id: string) => void
  query?: string
  density?: 'compact' | 'comfortable'
  onDelete?: (t: TranscriptRowData) => void
  onReprocess?: (id: string) => void
}

type ApiStatus = 'recording' | 'ended' | 'processing' | 'uploaded' | 'error' | 'idle'

const STATUS_MAP: Record<string, ApiStatus> = {
  live: 'recording',
  ended: 'ended',
  processing: 'processing',
  uploading: 'uploaded',
  failed: 'error',
  idle: 'idle',
}

function statusIconFor(apiStatus: ApiStatus): { node: ReactNode; colorClass: string } {
  switch (apiStatus) {
    case 'recording':
      return { node: I.Radio(14), colorClass: 'text-status-live' }
    case 'processing':
      return {
        node: (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[color-mix(in_oklch,var(--status-processing)_25%,transparent)] border-t-status-processing animate-[rfSpin_0.9s_linear_infinite]" />
        ),
        colorClass: 'text-status-processing',
      }
    case 'uploaded':
      return { node: I.Clock(14), colorClass: 'text-fg-muted' }
    case 'error':
      return { node: I.AlertTriangle(14), colorClass: 'text-destructive' }
    case 'ended':
      return { node: I.CheckCircle(14), colorClass: 'text-status-ok' }
    default:
      return { node: I.Clock(14), colorClass: 'text-fg-muted' }
  }
}

function buildRowMenu(
  t: TranscriptRowData,
  onDelete?: (t: TranscriptRowData) => void,
  onReprocess?: (id: string) => void,
) {
  const apiStatus = STATUS_MAP[t.status] ?? 'idle'
  const canReprocess = apiStatus === 'ended' || apiStatus === 'error'
  return [
    { label: 'Open', icon: I.ExternalLink(14) },
    { label: 'Rename', icon: I.Edit(14) },
    { separator: true as const },
    {
      label: 'Reprocess',
      icon: I.Refresh(14),
      disabled: !canReprocess,
      onClick: () => onReprocess?.(t.id),
    },
    { separator: true as const },
    {
      label: 'Delete',
      icon: I.Trash(14),
      danger: true,
      onClick: () => onDelete?.(t),
    },
  ]
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query || !text) return <>{text}</>
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[var(--reflector-accent-tint2)] text-fg px-0.5 py-0 rounded-[2px]">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}

export function TranscriptRow({
  t,
  active,
  onSelect,
  query,
  density = 'comfortable',
  onDelete,
  onReprocess,
}: Props) {
  const compact = density === 'compact'
  const apiStatus = STATUS_MAP[t.status] ?? 'idle'
  const statusIcon = statusIconFor(apiStatus)
  const sourceLabel = t.source === 'room' ? t.room || 'room' : t.source
  const isError = apiStatus === 'error'
  const errorMsg = isError ? t.error_message || t.error || 'Processing failed — reason unavailable' : null
  const snippet = query && t.snippet ? t.snippet : null
  const matchCount = query && t.snippet ? 1 : 0

  const [srcLang, tgtLang] = (t.lang || '').includes('→')
    ? (t.lang as string).split('→').map((s) => s.trim())
    : [t.lang, null]

  return (
    <div
      className={cn(
        'rf-row grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3.5 px-5 border-b border-border cursor-pointer relative',
        compact ? 'py-2.5' : 'py-3.5',
      )}
      data-active={active ? 'true' : undefined}
      onClick={() => onSelect?.(t.id)}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-[2px]" />
      )}

      <span className={cn('inline-flex', statusIcon.colorClass)}>{statusIcon.node}</span>

      <div className={cn('min-w-0 flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        <span
          className={cn(
            'font-serif font-semibold text-fg tracking-[-0.005em] whitespace-nowrap overflow-hidden text-ellipsis',
            compact ? 'text-sm' : 'text-[15px]',
          )}
        >
          <Highlight text={t.title || 'Unnamed transcript'} query={query} />
        </span>

        <div className="flex items-center flex-wrap gap-y-0.5 gap-x-0 text-[11.5px] text-fg-muted font-sans">
          <span>{sourceLabel}</span>
          <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
          <span className="font-mono text-[11px]">{fmtDate(t.date)}</span>
          <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
          <span className="font-mono text-[11px]">{fmtDur(t.duration)}</span>

          {t.speakers > 0 && (
            <>
              <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
              <span className="inline-flex items-center gap-1">
                {I.Users(11)} {t.speakers} {t.speakers === 1 ? 'speaker' : 'speakers'}
              </span>
            </>
          )}

          {srcLang && (
            <>
              <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  tgtLang ? 'text-primary' : 'text-fg-muted',
                )}
              >
                {I.Globe(11)}
                <span className="font-mono text-[10.5px] uppercase">
                  {srcLang}
                  {tgtLang && <> → {tgtLang}</>}
                </span>
              </span>
            </>
          )}
        </div>

        {errorMsg && (
          <div className="mt-1 px-2.5 py-1.5 text-[11.5px] leading-[1.45] font-sans text-destructive bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_20%,transparent)] rounded-sm flex items-start gap-1.5">
            <span className="mt-px shrink-0">{I.AlertTriangle(11)}</span>
            <span className="min-w-0">{errorMsg}</span>
          </div>
        )}

        {snippet && (
          <div className="mt-1 px-2.5 py-1.5 text-xs font-serif italic text-fg-muted leading-[1.5] bg-muted border-l-2 border-primary rounded-r-sm">
            “<Highlight text={snippet} query={query} />”
          </div>
        )}
      </div>

      <span>
        {matchCount > 0 && (
          <span className="inline-flex items-center px-2 py-px h-[18px] font-mono text-[10.5px] font-semibold text-primary bg-[var(--reflector-accent-tint)] border border-[var(--reflector-accent-tint2)] rounded-full">
            {matchCount} match
          </span>
        )}
      </span>

      <RowMenuTrigger items={buildRowMenu(t, onDelete, onReprocess)} />
    </div>
  )
}
