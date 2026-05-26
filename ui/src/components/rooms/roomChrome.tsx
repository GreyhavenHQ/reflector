import { Button } from '@/components/ui/primitives'

export function RoomLoading({ label }: { label: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
      }}
    >
      {label}
    </div>
  )
}

export function RoomError({
  message,
  onLeave,
}: {
  message: string
  onLeave: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 14,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <p
        style={{
          margin: 0,
          color: 'var(--destructive)',
          fontSize: 15,
          maxWidth: 380,
          textAlign: 'center',
        }}
      >
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onLeave}>
        Back to browse
      </Button>
    </div>
  )
}
