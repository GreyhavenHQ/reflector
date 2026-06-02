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
      className="rf-row grid grid-cols-[auto_1fr_auto] items-center gap-x-3.5 px-5 py-3.5 border-b border-border cursor-default relative opacity-75 bg-[repeating-linear-gradient(45deg,transparent_0_12px,color-mix(in_oklch,var(--muted)_40%,transparent)_12px_13px)]"
    >
      <span className="text-fg-muted inline-flex">{I.Trash(14)}</span>

      <div className="min-w-0 flex flex-col gap-1">
        <span className="font-serif text-[15px] font-medium text-fg-muted tracking-[-0.005em] line-through decoration-[color-mix(in_oklch,var(--fg-muted)_50%,transparent)] decoration-1 whitespace-nowrap overflow-hidden text-ellipsis">
          {t.title || 'Unnamed transcript'}
        </span>

        <div className="flex items-center flex-wrap gap-y-0.5 gap-x-0 text-[11.5px] text-fg-muted font-sans">
          <span>{sourceLabel}</span>
          <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
          <span className="font-mono text-[11px]">{fmtDate(t.date)}</span>
          {t.duration > 0 && (
            <>
              <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
              <span className="font-mono text-[11px]">{fmtDur(t.duration)}</span>
            </>
          )}
          <span className="mx-2 text-[var(--gh-grey-3)]">·</span>
          <span className="inline-flex items-center gap-1">
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
