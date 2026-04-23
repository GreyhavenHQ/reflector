import { useEffect, useState } from 'react'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'

type Props = {
  transcriptId: string
  /** Whether the panel is shown at all. */
  enabled: boolean
}

/**
 * Minimal embed for the Daily composed video. The composed video is served
 * through the backend under /v1/transcripts/{id}/video (auth required); we load
 * it into a <video> tag via a blob URL so the Authorization header can be set.
 */
export function VideoPanel({ transcriptId, enabled }: Props) {
  const [open, setOpen] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !open) return
    let cancelled = false
    let url: string | null = null
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(`/v1/transcripts/${transcriptId}/video`, {
          headers: authHeaders(),
        })
        if (!res.ok) throw new Error(`Video fetch failed (${res.status})`)
        const blob = await res.blob()
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load video')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [enabled, open, transcriptId])

  if (!enabled) return null

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg)',
        }}
      >
        <span
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform var(--dur-fast)',
            color: 'var(--fg-muted)',
            display: 'inline-flex',
          }}
        >
          {I.ChevronRight(14)}
        </span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Video recording</span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div style={{ padding: 16, paddingTop: 0 }}>
          {loading && (
            <div
              style={{ padding: 20, textAlign: 'center', color: 'var(--fg-muted)' }}
            >
              Loading video…
            </div>
          )}
          {error && (
            <div
              style={{
                padding: 12,
                color: 'var(--destructive)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {I.AlertTriangle(14)} {error}
            </div>
          )}
          {blobUrl && (
            <video
              src={blobUrl}
              controls
              style={{
                width: '100%',
                borderRadius: 'var(--radius-md)',
                background: 'var(--gh-off-black)',
              }}
            >
              {/* captions not wired yet */}
            </video>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            style={{ marginTop: 8 }}
          >
            {I.ChevronLeft(12)} Collapse
          </Button>
        </div>
      )}
    </div>
  )
}

function authHeaders(): Record<string, string> {
  try {
    // Reuse the token lookup approach from the WS hook.
    const pw = sessionStorage.getItem('reflector.password_token')
    if (pw) return { Authorization: `Bearer ${pw}` }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k?.startsWith('oidc.user:')) continue
      const raw = sessionStorage.getItem(k)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as { access_token?: string }
        if (parsed?.access_token) {
          return { Authorization: `Bearer ${parsed.access_token}` }
        }
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return {}
}
