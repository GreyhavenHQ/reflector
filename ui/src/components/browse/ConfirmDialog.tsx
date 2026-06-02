import { useEffect, type ReactNode } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  loading,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, loading])

  return (
    <>
      <div className="rf-modal-backdrop" onClick={() => !loading && onClose()} />
      <div
        className="rf-modal w-[min(440px,calc(100vw-32px))]"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'shrink-0 w-9 h-9 rounded-[10px] inline-flex items-center justify-center',
                danger
                  ? 'bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] text-destructive'
                  : 'bg-muted text-fg-muted',
              )}
            >
              {I.Trash(18)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="m-0 font-serif text-lg font-semibold text-fg">
                {title}
              </h2>
              <div className="mt-1.5 text-[13px] text-fg-muted leading-[1.5] font-sans">
                {message}
              </div>
            </div>
          </div>
        </div>
        <footer className="px-5 py-3.5 border-t border-border flex gap-2.5 justify-end">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={loading}
            className="text-fg font-semibold"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            disabled={loading}
            className={
              danger
                ? 'bg-destructive text-destructive-fg border-destructive shadow-xs'
                : undefined
            }
          >
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </footer>
      </div>
    </>
  )
}
