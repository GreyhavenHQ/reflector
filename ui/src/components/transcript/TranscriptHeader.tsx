import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
      }}
    >
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
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            outline: 'none',
          }}
        />
      ) : (
        <h1
          onClick={startEdit}
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: canEdit ? 'text' : 'default',
          }}
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

      <Button variant="outline" size="sm" onClick={onOpenShare} title="Share">
        {I.Share(13)} Share
      </Button>

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
    </div>
  )
}

function titleFor(t: Transcript): string {
  return t.title?.trim() || t.name?.trim() || 'Untitled transcript'
}
