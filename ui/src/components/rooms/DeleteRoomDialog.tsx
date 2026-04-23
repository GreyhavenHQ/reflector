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
        className="rf-modal"
        role="dialog"
        aria-modal="true"
        style={{ width: 'min(440px, calc(100vw - 32px))' }}
      >
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                color: 'var(--destructive)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {I.Trash(18)}
            </div>
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--fg)',
                }}
              >
                Delete room?
              </h2>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 13,
                  color: 'var(--fg-muted)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
                  /{name}
                </strong>{' '}
                will be permanently removed. Existing recordings from this room are not affected.
                This can't be undone.
              </p>
            </div>
          </div>
        </div>
        <footer
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            style={{ color: 'var(--fg)', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: 'var(--destructive)',
              color: 'var(--destructive-fg)',
              borderColor: 'var(--destructive)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            {I.Trash(14)} {loading ? 'Deleting…' : 'Delete room'}
          </Button>
        </footer>
      </div>
    </>
  )
}
