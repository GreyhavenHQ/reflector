import { I } from '@/components/icons'

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  const text = message?.trim() || 'Processing failed — reason unavailable.'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        color: 'var(--destructive)',
        background: 'color-mix(in oklch, var(--destructive) 8%, transparent)',
        border: '1px solid color-mix(in oklch, var(--destructive) 22%, transparent)',
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}>{I.AlertTriangle(14)}</span>
      <span>{text}</span>
    </div>
  )
}

export function AudioDeletedBanner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        color: 'var(--fg-muted)',
        background: 'var(--muted)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}>{I.Lock(14)}</span>
      <span>
        No audio is available because one or more participants didn't consent to keep the
        audio.
      </span>
    </div>
  )
}
