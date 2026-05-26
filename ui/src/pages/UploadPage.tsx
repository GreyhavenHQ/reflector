import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { getPasswordToken } from '@/api/client'
import { useRooms } from '@/hooks/useRooms'
import { useTranscript, useTranscriptMutations } from '@/hooks/useTranscript'
import type { SidebarFilter } from '@/lib/types'

const ACCEPT = '.mp3,.m4a,.wav,.mp4,.mov,.webm,audio/*,video/*'
const CHUNK_SIZE = 50 * 1024 * 1024 // 50 MB, mirrors www

export function UploadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: rooms = [] } = useRooms()
  const [collapsed, setCollapsed] = useState(false)

  const transcriptQuery = useTranscript(id)
  const { softDelete } = useTranscriptMutations(id)

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<XMLHttpRequest | null>(null)
  const cancelledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // If the backend already moved past "idle" (i.e. the user refreshed after
  // upload started), bounce them to the detail page to watch processing.
  useEffect(() => {
    const status = transcriptQuery.data?.status
    if (!status) return
    if (status !== 'idle') navigate(`/transcripts/${id}`, { replace: true })
  }, [transcriptQuery.data?.status, id, navigate])

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({
    kind: 'all',
    value: null,
  })
  const onSidebarFilter = (f: SidebarFilter) => {
    setSidebarFilter(f)
    if (f.kind === 'trash') navigate('/browse?trash=1')
    else if (f.kind === 'recent') navigate('/browse?recent=1')
    else if (f.kind === 'source') navigate(`/browse?source=${f.value}`)
    else if (f.kind === 'room') navigate(`/browse?source=room&room=${f.value}`)
    else navigate('/browse')
  }

  const pickFile = (f: File) => {
    setFile(f)
    setError(null)
    setProgress(0)
  }

  const cancelAndDiscard = async () => {
    cancelledRef.current = true
    abortRef.current?.abort()
    setUploading(false)
    try {
      await softDelete.mutateAsync()
    } catch {
      // non-fatal — transcript may already be in trash
    }
    navigate('/browse', { replace: true })
  }

  const startUpload = async () => {
    if (!file || !id) return
    setUploading(true)
    setError(null)
    setProgress(0)
    cancelledRef.current = false

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))

    try {
      for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
        if (cancelledRef.current) return
        const start = chunkNumber * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)
        await uploadChunk({
          id,
          chunk,
          fileName: file.name,
          chunkNumber,
          totalChunks,
          onProgress: (chunkLoaded) => {
            const overall = start + chunkLoaded
            setProgress(Math.min(100, Math.floor((overall / file.size) * 100)))
          },
          registerXhr: (xhr) => {
            abortRef.current = xhr
          },
        })
      }
      if (cancelledRef.current) return
      setProgress(100)
      toast.success('Upload complete. Processing started.')
      navigate(`/transcripts/${id}`, { replace: true })
    } catch (err) {
      if (cancelledRef.current) return
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      toast.error(msg)
      setUploading(false)
    }
  }

  const readableSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  return (
    <AppShell
      title="Upload recording"
      crumb={['browse', 'upload']}
      sidebar={
        <AppSidebar
          filter={sidebarFilter}
          onFilter={onSidebarFilter}
          rooms={rooms}
          tags={[]}
          showTags={false}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onNewRecording={() => navigate('/browse')}
        />
      }
    >
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xs)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--fg)',
            }}
          >
            Upload a recording
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.5,
            }}
          >
            Drop an audio or video file. Large files are split into 50 MB chunks
            and resumed on error.
          </p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            if (!uploading) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (uploading) return
            const f = e.dataTransfer.files?.[0]
            if (f) pickFile(f)
          }}
          htmlFor="rf-upload-input"
          style={{
            display: 'block',
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            background: dragOver
              ? 'color-mix(in srgb, var(--primary) 6%, var(--card))'
              : 'var(--card)',
            borderRadius: 'var(--radius-md)',
            padding: 32,
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background var(--dur-fast), border-color var(--dur-fast)',
          }}
        >
          <input
            ref={inputRef}
            id="rf-upload-input"
            type="file"
            accept={ACCEPT}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
              // allow picking the same file again
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
          <div
            style={{
              display: 'inline-flex',
              color: 'var(--fg-muted)',
              marginBottom: 10,
            }}
          >
            {I.Upload(26)}
          </div>
          {file ? (
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  color: 'var(--fg)',
                  fontWeight: 500,
                  wordBreak: 'break-all',
                }}
              >
                {file.name}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--fg-muted)',
                  marginTop: 2,
                }}
              >
                {readableSize(file.size)}
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--fg)',
                }}
              >
                Drag and drop a file here
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: 'var(--fg-muted)',
                }}
              >
                or click to pick one. Supports mp3, m4a, wav, mp4, mov, webm.
              </div>
            </>
          )}
        </label>

        {uploading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--fg-muted)',
              }}
            >
              <span>Uploading…</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{progress}%</span>
            </div>
            <div
              style={{
                height: 6,
                background: 'var(--muted)',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'var(--primary)',
                  transition: 'width var(--dur-fast) var(--ease-default)',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)',
              color: 'var(--destructive)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <Button
            variant="ghost"
            size="md"
            onClick={() => void cancelAndDiscard()}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!file || uploading}
            onClick={() => void startUpload()}
          >
            {I.Upload(14)} {uploading ? 'Uploading…' : 'Start upload'}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

function uploadChunk({
  id,
  chunk,
  fileName,
  chunkNumber,
  totalChunks,
  onProgress,
  registerXhr,
}: {
  id: string
  chunk: Blob
  fileName: string
  chunkNumber: number
  totalChunks: number
  onProgress: (loadedInChunk: number) => void
  registerXhr: (xhr: XMLHttpRequest) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    registerXhr(xhr)
    const qs = new URLSearchParams({
      chunk_number: String(chunkNumber),
      total_chunks: String(totalChunks),
    })
    xhr.open(
      'POST',
      `/v1/transcripts/${id}/record/upload?${qs.toString()}`,
    )
    const token = getBearerToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload aborted'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(chunk.size)
        resolve()
      } else {
        const detail = extractDetail(xhr.responseText) ?? `HTTP ${xhr.status}`
        reject(new Error(`Upload failed — ${detail}`))
      }
    }

    const form = new FormData()
    // Pass the filename explicitly — a Blob from File.slice() loses it, and
    // the backend derives the extension from chunk.filename.
    form.append('chunk', chunk, fileName)
    xhr.send(form)
  })
}

function getBearerToken(): string | null {
  // Match the auth middleware: prefer OIDC access token, fall back to
  // sessionStorage password token. Inline here because XHR doesn't go
  // through the openapi-fetch middleware chain.
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k?.startsWith('oidc.user:')) continue
      const raw = sessionStorage.getItem(k)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as { access_token?: string }
        if (parsed?.access_token) return parsed.access_token
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return getPasswordToken()
}

function extractDetail(body: string): string | null {
  try {
    const obj = JSON.parse(body) as { detail?: string }
    if (typeof obj?.detail === 'string') return obj.detail
  } catch {
    // plain text response
  }
  return body.trim() || null
}
