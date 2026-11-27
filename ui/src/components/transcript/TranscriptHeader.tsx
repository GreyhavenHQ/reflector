import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { cn } from '@/lib/utils'
import { Button, RowMenuTrigger, StatusBadge } from '@/components/ui/primitives'
import type { TranscriptStatus as UiStatus } from '@/components/ui/primitives'

type Transcript = components['schemas']['GetTranscriptWithParticipants']

const API_TO_UI: Record<Transcript['status'], UiStatus> = {
  idle: 'idle',
  uploaded: 'uploading',
  recording: 'live',
  processing: 'processing',
  error: 'failed',
  ended: 'ended',
}

type Props = {
  transcript: Transcript
  canEdit: boolean
  canDownload: boolean
  onRename: (next: string) => Promise<void> | void
  onCopyMarkdown: () => void
  onOpenShare: () => void
  onDownloadZip: () => void
  onDelete: () => void
  onToggleVideo?: (() => void) | null
  videoOpen?: boolean
  readOnly?: boolean
}

export function TranscriptHeader({
  transcript,
  canEdit,
  canDownload,
  onRename,
  onCopyMarkdown,
  onOpenShare,
  onDownloadZip,
  onDelete,
  onToggleVideo,
  videoOpen,
  readOnly,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(titleFor(transcript))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(titleFor(transcript))
  }, [transcript, editing])

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editing])

  const startEdit = () => {
    if (!canEdit) return
    setDraft(titleFor(transcript))
    setEditing(true)
  }

  const cancel = () => {
    setDraft(titleFor(transcript))
    setEditing(false)
  }

  const commit = async () => {
    const next = draft.trim()
    if (!next || next === titleFor(transcript)) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onRename(next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-card rounded-t-lg">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={() => void commit()}
          className="flex-1 min-w-0 font-serif text-[22px] font-semibold tracking-[-0.02em] text-fg bg-bg border border-border rounded-sm px-2 py-1 outline-none"
        />
      ) : (
        <h1
          onClick={startEdit}
          className={cn(
            'flex-1 min-w-0 m-0 font-serif text-[22px] font-semibold tracking-[-0.02em] text-fg whitespace-nowrap overflow-hidden text-ellipsis',
            canEdit ? 'cursor-text' : 'cursor-default',
          )}
          title={canEdit ? 'Click to rename' : undefined}
        >
          {titleFor(transcript)}
        </h1>
      )}

      <StatusBadge status={API_TO_UI[transcript.status]} />

      {onToggleVideo && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleVideo}
          title={videoOpen ? 'Hide video' : 'Show video'}
        >
          {I.FileAudio(13)} {videoOpen ? 'Hide video' : 'Video'}
        </Button>
      )}

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={onOpenShare} title="Share">
          {I.Share(13)} Share
        </Button>
      )}

      {readOnly ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopyMarkdown}
          title="Copy transcript as markdown"
        >
          {I.Copy(13)} Copy
        </Button>
      ) : (
        <RowMenuTrigger
          items={[
            {
              label: 'Rename',
              icon: I.Edit(14),
              onClick: startEdit,
              disabled: !canEdit,
            },
            {
              label: 'Copy as markdown',
              icon: I.Copy(14),
              onClick: onCopyMarkdown,
            },
            {
              label: 'Download ZIP',
              icon: I.Download(14),
              onClick: onDownloadZip,
              disabled: !canDownload,
            },
            { separator: true as const },
            {
              label: 'Delete',
              icon: I.Trash(14),
              danger: true,
              disabled: !canEdit,
              onClick: onDelete,
            },
          ]}
          label="Transcript options"
        />
      )}
    </div>
  )
}

function titleFor(t: Transcript): string {
  return t.title?.trim() || t.name?.trim() || 'Untitled transcript'
}
