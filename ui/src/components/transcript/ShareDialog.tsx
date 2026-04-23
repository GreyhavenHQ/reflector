import {
  Component,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { Combobox } from '@/components/ui/Combobox'
import type { components } from '@/api/schema'

type Transcript = components['schemas']['GetTranscriptWithParticipants']
type ShareMode = 'private' | 'semi-private' | 'public'

type Props = {
  transcript: Transcript
  canEdit: boolean
  onClose: () => void
  onChangeShareMode: (mode: ShareMode) => Promise<void>
  onSendEmail: (email: string) => Promise<void>
  onPostToZulip: (stream: string, topic: string) => Promise<void>
}

const MODE_LABEL: Record<ShareMode, string> = {
  private: 'Private',
  'semi-private': 'Secure',
  public: 'Public',
}

const MODE_HINT: Record<ShareMode, string> = {
  private: 'Only you.',
  'semi-private': 'Anyone signed into this Reflector instance.',
  public: 'Anyone with the link.',
}

export function ShareDialog(props: Props) {
  return (
    <DialogBoundary onClose={props.onClose}>
      <ShareDialogInner {...props} />
    </DialogBoundary>
  )
}

function ShareDialogInner({
  transcript,
  canEdit,
  onClose,
  onChangeShareMode,
  onSendEmail,
  onPostToZulip,
}: Props) {
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/config')
      if (!response.ok || !data) throw new Error('Config unavailable')
      return data
    },
    staleTime: 5 * 60_000,
  })

  const [emailInput, setEmailInput] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [stream, setStream] = useState('')
  const [topic, setTopic] = useState('')
  const [postingZulip, setPostingZulip] = useState(false)
  const [modeBusy, setModeBusy] = useState(false)

  const zulipEnabledForFetch = Boolean(
    (config as { zulip_enabled?: boolean } | undefined)?.zulip_enabled,
  )
  const { data: zulipStreams = [] } = useQuery({
    queryKey: ['zulip', 'streams'],
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/zulip/streams')
      if (!response.ok || !data) throw new Error('Failed to load Zulip streams')
      return data
    },
    enabled: zulipEnabledForFetch,
    staleTime: 5 * 60_000,
  })
  const selectedStreamId =
    zulipStreams.find((s) => s.name === stream)?.stream_id ?? null
  const { data: zulipTopics = [] } = useQuery({
    queryKey: ['zulip', 'topics', selectedStreamId],
    queryFn: async () => {
      if (selectedStreamId == null) return []
      const { data, response } = await apiClient.GET(
        '/v1/zulip/streams/{stream_id}/topics',
        { params: { path: { stream_id: selectedStreamId } } },
      )
      if (!response.ok || !data) throw new Error('Failed to load Zulip topics')
      return data
    },
    enabled: zulipEnabledForFetch && selectedStreamId != null,
    staleTime: 60_000,
  })

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : ''
  const mode = (transcript.share_mode ?? 'private') as ShareMode
  const zulipEnabled = (config as { zulip_enabled?: boolean } | undefined)?.zulip_enabled
  const emailEnabled = (config as { email_enabled?: boolean } | undefined)?.email_enabled
  const canZulip = zulipEnabled && mode !== 'public'

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleMode = async (next: ShareMode) => {
    if (next === mode) return
    setModeBusy(true)
    try {
      await onChangeShareMode(next)
    } finally {
      setModeBusy(false)
    }
  }

  const handleEmail = async () => {
    if (!emailInput.trim()) return
    setSendingEmail(true)
    try {
      await onSendEmail(emailInput.trim())
      toast.success('Email sent')
      setEmailInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Email failed')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleZulip = async () => {
    if (!stream.trim() || !topic.trim()) return
    setPostingZulip(true)
    try {
      await onPostToZulip(stream.trim(), topic.trim())
      toast.success('Posted to Zulip')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Zulip post failed')
    } finally {
      setPostingZulip(false)
    }
  }

  return (
    <>
      <div className="rf-modal-backdrop" onClick={onClose} />
      <div
        className="rf-modal"
        role="dialog"
        aria-modal="true"
        style={{ width: 'min(560px, calc(100vw - 32px))' }}
      >
        <header
          style={{
            padding: '16px 20px 12px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
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
              Share transcript
            </h2>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {MODE_LABEL[mode]} — {MODE_HINT[mode]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              padding: 6,
              cursor: 'pointer',
              color: 'var(--fg-muted)',
              display: 'inline-flex',
            }}
          >
            {I.X(16)}
          </button>
        </header>

        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxHeight: 'calc(100vh - 180px)',
            overflowY: 'auto',
          }}
        >
          {canEdit && (
            <Section label="Privacy">
              <div
                style={{
                  display: 'inline-flex',
                  gap: 0,
                  padding: 2,
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 9999,
                }}
              >
                {(['private', 'semi-private', 'public'] as const).map((m) => {
                  const on = m === mode
                  return (
                    <button
                      key={m}
                      onClick={() => handleMode(m)}
                      disabled={modeBusy}
                      style={{
                        padding: '5px 12px',
                        border: 'none',
                        borderRadius: 9999,
                        background: on ? 'var(--card)' : 'transparent',
                        color: on ? 'var(--fg)' : 'var(--fg-muted)',
                        boxShadow: on ? 'var(--shadow-xs)' : 'none',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12.5,
                        fontWeight: on ? 600 : 500,
                        cursor: modeBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          <Section label="Share link">
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 8,
              }}
            >
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="rf-input"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  height: 34,
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={copyUrl}
                style={{ flexShrink: 0 }}
              >
                {I.Copy(13)} Copy
              </Button>
            </div>
          </Section>

          {emailEnabled && (
            <Section label="Email">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: 8,
                }}
              >
                <input
                  className="rf-input"
                  type="email"
                  placeholder="person@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleEmail()
                  }}
                  style={{ flex: 1, height: 34, fontSize: 13 }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEmail}
                  disabled={sendingEmail || !emailInput.trim()}
                  style={{ flexShrink: 0 }}
                >
                  {sendingEmail ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </Section>
          )}

          {canZulip && (
            <Section label="Zulip">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr auto',
                  gap: 8,
                  alignItems: 'stretch',
                }}
              >
                <Combobox
                  value={stream}
                  onChange={(v) => {
                    setStream(v)
                    setTopic('')
                  }}
                  options={zulipStreams.map((s) => s.name)}
                  placeholder="Stream"
                  inputStyle={{ height: 34, fontSize: 13 }}
                />
                <Combobox
                  value={topic}
                  onChange={setTopic}
                  options={zulipTopics.map((t) => t.name)}
                  placeholder="Topic"
                  inputStyle={{ height: 34, fontSize: 13 }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleZulip}
                  disabled={postingZulip || !stream.trim() || !topic.trim()}
                  style={{ flexShrink: 0 }}
                >
                  {postingZulip ? 'Posting…' : 'Post'}
                </Button>
              </div>
            </Section>
          )}
        </div>

        <footer
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </>
  )
}

/**
 * Dialog-wide boundary so any render failure inside the dialog body shows a
 * graceful message and a Close button instead of white-screening the app.
 */
class DialogBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(err: Error) {
    return { error: err }
  }
  componentDidCatch(err: unknown) {
    console.error('ShareDialog crashed', err)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <>
        <div className="rf-modal-backdrop" onClick={this.props.onClose} />
        <div
          className="rf-modal"
          role="dialog"
          aria-modal="true"
          style={{ width: 'min(480px, calc(100vw - 32px))' }}
        >
          <header
            style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
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
                flex: 1,
              }}
            >
              Share — something went wrong
            </h2>
          </header>
          <div
            style={{
              padding: 20,
              fontSize: 13,
              color: 'var(--fg)',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.5,
            }}
          >
            <p style={{ margin: '0 0 10px' }}>
              The Share dialog hit an error. Your link is:
            </p>
            <code
              style={{
                display: 'block',
                padding: 10,
                background: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                wordBreak: 'break-all',
              }}
            >
              {typeof window !== 'undefined'
                ? `${window.location.origin}${window.location.pathname}`
                : ''}
            </code>
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                fontSize: 11.5,
                color: 'var(--fg-muted)',
              }}
            >
              {this.state.error.message}
            </p>
          </div>
          <footer
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Button variant="ghost" size="sm" onClick={this.props.onClose}>
              Close
            </Button>
          </footer>
        </div>
      </>
    )
  }
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--fg-muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
