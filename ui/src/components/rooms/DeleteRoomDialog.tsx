import { useEffect } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'

type Props = {
  name: string
  onClose: () => void
  onConfirm: () => void
  loading?: boolean
}

export function DeleteRoomDialog({ name, onClose, onConfirm, loading }: Props) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <>
      <div className="rf-modal-backdrop" onClick={onClose} />
      <div
        className="rf-modal w-[min(440px,calc(100vw-32px))]"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-[10px] bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] text-destructive inline-flex items-center justify-center">
              {I.Trash(18)}
            </div>
            <div className="flex-1">
              <h2 className="m-0 font-serif text-lg font-semibold text-fg">
                Delete room?
              </h2>
              <p className="mt-1.5 mb-0 text-[13px] text-fg-muted leading-[1.5]">
                <strong className="text-fg font-mono">
                  /{name}
                </strong>{' '}
                will be permanently removed. Existing recordings from this room are not affected.
                This can't be undone.
              </p>
            </div>
          </div>
        </div>
        <footer className="px-5 py-3.5 border-t border-border flex gap-2.5 justify-end">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            className="text-fg font-semibold"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-fg border-destructive shadow-xs"
          >
            {I.Trash(14)} {loading ? 'Deleting…' : 'Delete room'}
          </Button>
        </footer>
      </div>
    </>
  )
}
