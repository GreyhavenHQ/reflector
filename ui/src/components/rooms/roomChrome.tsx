import { Button } from '@/components/ui/primitives'

export function RoomLoading({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center text-fg-muted font-sans text-sm">
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
    <div className="fixed inset-0 bg-bg flex items-center justify-center flex-col gap-3.5 font-sans">
      <p className="m-0 text-destructive text-[15px] max-w-[380px] text-center">
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onLeave}>
        Back to browse
      </Button>
    </div>
  )
}
