import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { apiClient } from '@/api/client'
import { useRooms } from '@/hooks/useRooms'
import { REFLECTOR_LANGS } from '@/lib/types'

type Props = {
  onClose: () => void
}

export function NewTranscriptDialog({ onClose }: Props) {
  const navigate = useNavigate()
  const { data: rooms = [] } = useRooms()
  const [title, setTitle] = useState('')
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('')
  const [roomId, setRoomId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, submitting])

  const submit = async () => {
    setSubmitting(true)
    try {
      const { data, response } = await apiClient.POST('/v1/transcripts', {
        body: {
          name: title || null,
          source_language: sourceLang === 'auto' ? null : sourceLang,
          target_language: targetLang || null,
          room_id: roomId || null,
        } as never,
      })
      if (!response.ok || !data) throw new Error('Could not create transcript')
      const id = (data as { id: string }).id
      onClose()
      navigate(`/browse?active=${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create transcript')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = () => {
    toast.info('Upload flow lives on the transcript detail page — ship next pass.')
  }

  return (
    <>
      <div className="rf-modal-backdrop" onClick={() => !submitting && onClose()} />
      <div
        className="rf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-new-title"
      >
        <header
          style={{
            padding: '18px 20px 14px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ flex: 1 }}>
            <h2
              id="rf-new-title"
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: 'var(--fg)',
              }}
            >
              New transcript
            </h2>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12.5,
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Record live or upload a file. You can edit details later.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              padding: 6,
              cursor: 'pointer',
              color: 'var(--fg-muted)',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
            }}
          >
            {I.X(16)}
          </button>
        </header>

        <div
          style={{
            padding: 20,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div>
            <label className="rf-label" htmlFor="rf-nd-title">
              Title
            </label>
            <input
              id="rf-nd-title"
              className="rf-input"
              type="text"
              autoFocus
              placeholder="e.g. Sprint review — June 12"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <label className="rf-label" htmlFor="rf-nd-source">
              {I.Mic(13)} Spoken language
            </label>
            <select
              id="rf-nd-source"
              className="rf-select"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              style={{ marginTop: 6 }}
            >
              {REFLECTOR_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <div className="rf-hint">Detected from the audio if set to Auto.</div>
          </div>

          <div>
            <label className="rf-label" htmlFor="rf-nd-target">
              {I.Globe(13)} Translate to
            </label>
            <select
              id="rf-nd-target"
              className="rf-select"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              style={{ marginTop: 6 }}
            >
              <option value="">— None (same as spoken) —</option>
              {REFLECTOR_LANGS.filter((l) => l.code !== 'auto').map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <div className="rf-hint">Leave blank to skip translation.</div>
          </div>

          <div>
            <label className="rf-label" htmlFor="rf-nd-room">
              {I.Folder(13)} Attach to room{' '}
              <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>— optional</span>
            </label>
            <select
              id="rf-nd-room"
              className="rf-select"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ marginTop: 6 }}
            >
              <option value="">— None —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <footer
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: 11.5,
              color: 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {I.Lock(12)}
            Audio stays on your infrastructure.
          </div>
          <Button variant="secondary" size="md" onClick={handleUpload} disabled={submitting}>
            {I.Upload(14)} Upload file
          </Button>
          <Button variant="primary" size="md" onClick={submit} disabled={submitting}>
            {I.Mic(14)} {submitting ? 'Starting…' : 'Start recording'}
          </Button>
        </footer>
      </div>
    </>
  )
}
