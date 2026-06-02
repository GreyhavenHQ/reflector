import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { apiClient } from '@/api/client'
import { REFLECTOR_LANGS } from '@/lib/types'

type Props = {
  onClose: () => void
}

export function NewTranscriptDialog({ onClose }: Props) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, submitting])

  const createAndGo = async (kind: 'live' | 'file') => {
    setSubmitting(true)
    try {
      // Backend accepts source_language: str | None — null is the
      // auto-detect signal. Target falls back to source (or "en" when
      // source is auto) so the translator has a concrete target.
      const sourcePayload = sourceLang === 'auto' ? null : sourceLang
      const targetPayload =
        targetLang || (sourceLang === 'auto' ? 'en' : sourceLang)
      const { data, response } = await apiClient.POST('/v1/transcripts', {
        body: {
          name: title.trim() || 'Untitled',
          source_language: sourcePayload,
          target_language: targetPayload,
          source_kind: kind,
        } as never,
      })
      if (!response.ok || !data) throw new Error('Could not create transcript')
      const id = (data as { id: string }).id
      onClose()
      navigate(kind === 'file' ? `/transcripts/${id}/upload` : `/transcripts/${id}/record`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create transcript')
    } finally {
      setSubmitting(false)
    }
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
        <header className="pt-[18px] px-5 pb-3.5 flex items-center border-b border-border">
          <div className="flex-1">
            <h2
              id="rf-new-title"
              className="m-0 font-serif text-xl font-semibold tracking-[-0.01em] text-fg"
            >
              New transcript
            </h2>
            <p className="mt-0.5 mb-0 mx-0 text-[12.5px] text-fg-muted font-sans">
              Record live or upload a file. You can edit details later.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="border-none bg-transparent p-1.5 cursor-pointer text-fg-muted rounded-sm inline-flex"
          >
            {I.X(16)}
          </button>
        </header>

        <div className="p-5 overflow-auto flex flex-col gap-4">
          <div>
            <label className="rf-label" htmlFor="rf-nd-title">
              Title
            </label>
            <input
              id="rf-nd-title"
              className="rf-input mt-1.5"
              type="text"
              autoFocus
              placeholder="e.g. Sprint review — June 12"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="rf-label" htmlFor="rf-nd-source">
              {I.Mic(13)} Spoken language
            </label>
            <select
              id="rf-nd-source"
              className="rf-select mt-1.5"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
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
              className="rf-select mt-1.5"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
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

        </div>

        <footer className="py-3.5 px-5 border-t border-border flex gap-2.5 items-center">
          <div className="flex-1 text-[11.5px] text-fg-muted flex items-center gap-1.5 font-sans">
            {I.Lock(12)}
            Audio stays on your infrastructure.
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={() => void createAndGo('file')}
            disabled={submitting}
          >
            {I.Upload(14)} Upload file
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void createAndGo('live')}
            disabled={submitting}
          >
            {I.Mic(14)} {submitting ? 'Starting…' : 'Start recording'}
          </Button>
        </footer>
      </div>
    </>
  )
}
