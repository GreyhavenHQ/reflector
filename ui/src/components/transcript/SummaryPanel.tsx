import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/primitives'
import { Markdown } from '@/lib/markdown'

type Props = {
  summary: string | null | undefined
  /** Controlled edit mode — parent owns the state so it can show its own
   *  "Edit" action button (e.g. in a tab-nav row). */
  editing: boolean
  onEditingChange: (next: boolean) => void
  saving: boolean
  onSave: (next: string) => Promise<void> | void
}

/**
 * Body-only summary view. Renders the Markdown summary, or a textarea
 * editor when `editing` is true. No card chrome and no header — the
 * parent (SummaryTranslationTabs) provides those.
 */
export function SummaryPanel({
  summary,
  editing,
  onEditingChange,
  saving,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(summary ?? '')

  useEffect(() => {
    if (!editing) setDraft(summary ?? '')
  }, [summary, editing])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEditingChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing, onEditingChange])

  const save = async () => {
    await onSave(draft)
    onEditingChange(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault()
              void save()
            }
          }}
          autoFocus
          className="w-full min-h-[200px] p-3 font-sans text-[13.5px] leading-[1.55] text-fg bg-bg border border-border rounded-md resize-y outline-none"
        />
        <div className="flex gap-2.5 justify-end">
          <span className="flex-1 self-center text-[11.5px] text-fg-muted font-sans">
            Shift+Enter to save · Escape to cancel
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditingChange(false)}
            disabled={saving}
            className="text-fg font-semibold"
          >
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  if (summary?.trim()) {
    return (
      <div className="font-sans text-[13.5px]">
        <Markdown source={summary} />
      </div>
    )
  }

  return (
    <div className="text-[13px] text-fg-muted italic">
      No summary available yet.
    </div>
  )
}
