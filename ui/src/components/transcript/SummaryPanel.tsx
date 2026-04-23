import { useEffect, useState } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { Markdown } from '@/lib/markdown'

type Props = {
  summary: string | null | undefined
  canEdit: boolean
  saving: boolean
  onSave: (next: string) => Promise<void> | void
}

export function SummaryPanel({ summary, canEdit, saving, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(summary ?? '')

  useEffect(() => {
    if (!editing) setDraft(summary ?? '')
  }, [summary, editing])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing])

  const save = async () => {
    await onSave(draft)
    setEditing(false)
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
          }}
        >
          Summary
        </h2>
        {canEdit && !editing && (
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setEditing(true)}
            title="Edit summary"
          >
            {I.Edit(14)}
          </Button>
        )}
      </div>

      {editing ? (
        <>
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
            style={{
              width: '100%',
              minHeight: 200,
              padding: 12,
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5,
              lineHeight: 1.55,
              color: 'var(--fg)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div
            style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}
          >
            <span
              style={{
                flex: 1,
                alignSelf: 'center',
                fontSize: 11.5,
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Shift+Enter to save · Escape to cancel
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{ color: 'var(--fg)', fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      ) : summary?.trim() ? (
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5 }}>
          <Markdown source={summary} />
        </div>
      ) : (
        <div
          style={{ fontSize: 13, color: 'var(--fg-muted)', fontStyle: 'italic' }}
        >
          No summary available yet.
        </div>
      )}
    </div>
  )
}
