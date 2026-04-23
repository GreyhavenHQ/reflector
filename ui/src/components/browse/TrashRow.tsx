import { I } from '@/components/icons'
import { RowMenuTrigger } from '@/components/ui/primitives'
import { fmtDate, fmtDur } from '@/lib/format'
import type { TranscriptRowData } from '@/lib/types'

type Props = {
  t: TranscriptRowData
  onRestore?: (id: string) => void
  onDestroy?: (t: TranscriptRowData) => void
}

export function TrashRow({ t, onRestore, onDestroy }: Props) {
  const sourceLabel = t.source === 'room' ? t.room || 'room' : t.source
  return (
    <div
      className="rf-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        columnGap: 14,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        cursor: 'default',
        position: 'relative',
        opacity: 0.78,
        background:
          'repeating-linear-gradient(45deg, transparent 0 12px, color-mix(in oklch, var(--muted) 40%, transparent) 12px 13px)',
      }}
    >
      <span style={{ color: 'var(--fg-muted)', display: 'inline-flex' }}>{I.Trash(14)}</span>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--fg-muted)',
            letterSpacing: '-0.005em',
            textDecoration: 'line-through',
            textDecorationColor: 'color-mix(in oklch, var(--fg-muted) 50%, transparent)',
            textDecorationThickness: '1px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t.title || 'Unnamed transcript'}
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
          {t.duration > 0 && (
            <>
              <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {fmtDur(t.duration)}
              </span>
            </>
          )}
          <span style={{ margin: '0 8px', color: 'var(--gh-grey-3)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {I.Trash(11)} Deleted
          </span>
        </div>
      </div>

      <RowMenuTrigger
        label="Trash options"
        items={[
          {
            label: 'Restore',
            icon: I.Undo(14),
            onClick: () => onRestore?.(t.id),
          },
          { separator: true },
          {
            label: 'Destroy permanently',
            icon: I.Trash(14),
            danger: true,
            onClick: () => onDestroy?.(t),
          },
        ]}
      />
    </div>
  )
}
