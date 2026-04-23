import { useEffect, type ReactNode } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'

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
                background: danger
                  ? 'color-mix(in srgb, var(--destructive) 12%, transparent)'
                  : 'var(--muted)',
                color: danger ? 'var(--destructive)' : 'var(--fg-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {I.Trash(18)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--fg)',
                }}
              >
                {title}
              </h2>
              <div
                style={{
                  margin: '6px 0 0',
                  fontSize: 13,
                  color: 'var(--fg-muted)',
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {message}
              </div>
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
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={loading}
            style={{ color: 'var(--fg)', fontWeight: 600 }}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            disabled={loading}
            style={
              danger
                ? {
                    background: 'var(--destructive)',
                    color: 'var(--destructive-fg)',
                    borderColor: 'var(--destructive)',
                    boxShadow: 'var(--shadow-xs)',
                  }
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
