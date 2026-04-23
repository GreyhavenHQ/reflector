import { type ReactNode } from 'react'
import { I } from '@/components/icons'
import { RowMenuTrigger } from '@/components/ui/primitives'
import { fmtDate, fmtDur } from '@/lib/format'
import type { TranscriptRowData } from '@/lib/types'

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

function statusIconFor(apiStatus: ApiStatus): { node: ReactNode; color: string } {
  switch (apiStatus) {
    case 'recording':
      return { node: I.Radio(14), color: 'var(--status-live)' }
    case 'processing':
      return {
        node: (
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 9999,
              display: 'inline-block',
              border: '2px solid color-mix(in oklch, var(--status-processing) 25%, transparent)',
              borderTopColor: 'var(--status-processing)',
              animation: 'rfSpin 0.9s linear infinite',
            }}
          />
        ),
        color: 'var(--status-processing)',
      }
    case 'uploaded':
      return { node: I.Clock(14), color: 'var(--fg-muted)' }
    case 'error':
      return { node: I.AlertTriangle(14), color: 'var(--destructive)' }
    case 'ended':
      return { node: I.CheckCircle(14), color: 'var(--status-ok)' }
    default:
      return { node: I.Clock(14), color: 'var(--fg-muted)' }
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
      <mark
        style={{
          background: 'var(--reflector-accent-tint2)',
          color: 'var(--fg)',
          padding: '0 2px',
          borderRadius: 2,
        }}
      >
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
  const vpad = compact ? 10 : 14
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
      className="rf-row"
      data-active={active ? 'true' : undefined}
      onClick={() => onSelect?.(t.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        alignItems: 'center',
        columnGap: 14,
        padding: `${vpad}px 20px`,
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            background: 'var(--primary)',
            borderRadius: 2,
          }}
        />
      )}

      <span style={{ color: statusIcon.color, display: 'inline-flex' }}>{statusIcon.node}</span>

      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 2 : 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: compact ? 14 : 15,
            fontWeight: 600,
            color: 'var(--fg)',
            letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <Highlight text={t.title || 'Unnamed transcript'} query={query} />
        </span>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 2,
            columnGap: 0,
            fontSize: 11.5,
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span>{sourceLabel}</span>
          <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmtDate(t.date)}</span>
          <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmtDur(t.duration)}</span>

          {t.speakers > 0 && (
            <>
              <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {I.Users(11)} {t.speakers} {t.speakers === 1 ? 'speaker' : 'speakers'}
              </span>
            </>
          )}

          {srcLang && (
            <>
              <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  color: tgtLang ? 'var(--primary)' : 'var(--fg-muted)',
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
                  {srcLang}
                  {tgtLang && <> → {tgtLang}</>}
                </span>
              </span>
            </>
          )}
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: 4,
              padding: '6px 10px',
              fontSize: 11.5,
              lineHeight: 1.45,
              fontFamily: 'var(--font-sans)',
              color: 'var(--destructive)',
              background: 'color-mix(in oklch, var(--destructive) 8%, transparent)',
              border: '1px solid color-mix(in oklch, var(--destructive) 20%, transparent)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            <span style={{ marginTop: 1, flexShrink: 0 }}>{I.AlertTriangle(11)}</span>
            <span style={{ minWidth: 0 }}>{errorMsg}</span>
          </div>
        )}

        {snippet && (
          <div
            style={{
              marginTop: 4,
              padding: '6px 10px',
              fontSize: 12,
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              color: 'var(--fg-muted)',
              lineHeight: 1.5,
              background: 'var(--muted)',
              borderLeft: '2px solid var(--primary)',
              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            }}
          >
            “<Highlight text={snippet} query={query} />”
          </div>
        )}
      </div>

      <span>
        {matchCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 8px',
              height: 18,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--primary)',
              background: 'var(--reflector-accent-tint)',
              border: '1px solid var(--reflector-accent-tint2)',
              borderRadius: 9999,
            }}
          >
            {matchCount} match
          </span>
        )}
      </span>

      <RowMenuTrigger items={buildRowMenu(t, onDelete, onReprocess)} />
    </div>
  )
}
