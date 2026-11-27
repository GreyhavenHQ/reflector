import { I } from '@/components/icons'

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  const text = message?.trim() || 'Processing failed — reason unavailable.'
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 text-destructive bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_22%,transparent)] rounded-md font-sans text-[13px] leading-[1.45]">
      <span className="mt-0.5 shrink-0">{I.AlertTriangle(14)}</span>
      <span>{text}</span>
    </div>
  )
}

export function AudioDeletedBanner() {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 text-fg-muted bg-muted border border-border rounded-md font-sans text-[13px] leading-[1.45]">
      <span className="mt-0.5 shrink-0">{I.Lock(14)}</span>
      <span>
        No audio is available because one or more participants didn't consent to keep the
        audio.
      </span>
    </div>
  )
}
