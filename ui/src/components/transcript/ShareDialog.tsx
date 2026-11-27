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
import { cn } from '@/lib/utils'
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
  const mode = props.transcript.share_mode ?? 'private'
  const fallbackUrl =
    typeof window !== 'undefined'
      ? mode === 'public'
        ? `${window.location.origin}/v2/shared/${props.transcript.id}`
        : `${window.location.origin}${window.location.pathname}`
      : ''
  return (
    <DialogBoundary onClose={props.onClose} fallbackUrl={fallbackUrl}>
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

  const mode = (transcript.share_mode ?? 'private') as ShareMode
  // Public transcripts copy the anonymous-viewer URL (`/shared/:id`) so the
  // link works for non-logged-in recipients. Owner/semi-private links keep
  // pointing at the authenticated detail page.
  const url =
    typeof window !== 'undefined'
      ? mode === 'public'
        ? `${window.location.origin}/v2/shared/${transcript.id}`
        : `${window.location.origin}${window.location.pathname}`
      : ''
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
        className="rf-modal w-[min(560px,calc(100vw-32px))]"
        role="dialog"
        aria-modal="true"
      >
        <header className="pt-4 pr-5 pb-3 pl-5 flex items-center border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="m-0 font-serif text-lg font-semibold tracking-[-0.01em] text-fg">
              Share transcript
            </h2>
            <p className="mt-0.5 mb-0 text-xs text-fg-muted font-sans">
              {MODE_LABEL[mode]} — {MODE_HINT[mode]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="border-none bg-transparent p-1.5 cursor-pointer text-fg-muted inline-flex"
          >
            {I.X(16)}
          </button>
        </header>

        <div className="p-5 flex flex-col gap-4 max-h-[calc(100vh-180px)] overflow-y-auto">
          {canEdit && (
            <Section label="Privacy">
              <div className="inline-flex gap-0 p-0.5 bg-muted border border-border rounded-full">
                {(['private', 'semi-private', 'public'] as const).map((m) => {
                  const on = m === mode
                  return (
                    <button
                      key={m}
                      onClick={() => handleMode(m)}
                      disabled={modeBusy}
                      className={cn(
                        'py-[5px] px-3 border-none rounded-full font-sans text-[12.5px]',
                        on
                          ? 'bg-card text-fg shadow-xs font-semibold'
                          : 'bg-transparent text-fg-muted font-medium',
                        modeBusy ? 'cursor-wait' : 'cursor-pointer',
                      )}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          <Section label="Share link">
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="rf-input flex-1 min-w-0 font-mono text-[11.5px] h-[34px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={copyUrl}
                className="shrink-0"
              >
                {I.Copy(13)} Copy
              </Button>
            </div>
          </Section>

          {emailEnabled && (
            <Section label="Email">
              <div className="flex items-stretch gap-2">
                <input
                  className="rf-input flex-1 h-[34px] text-[13px]"
                  type="email"
                  placeholder="person@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleEmail()
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEmail}
                  disabled={sendingEmail || !emailInput.trim()}
                  className="shrink-0"
                >
                  {sendingEmail ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </Section>
          )}

          {canZulip && (
            <Section label="Zulip">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-stretch">
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
                  className="shrink-0"
                >
                  {postingZulip ? 'Posting…' : 'Post'}
                </Button>
              </div>
            </Section>
          )}
        </div>

        <footer className="py-2.5 px-5 border-t border-border flex justify-end">
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
  { onClose: () => void; fallbackUrl: string; children: ReactNode },
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
          className="rf-modal w-[min(480px,calc(100vw-32px))]"
          role="dialog"
          aria-modal="true"
        >
          <header className="pt-4 pr-5 pb-3 pl-5 border-b border-border flex items-center gap-2.5">
            <h2 className="m-0 font-serif text-lg font-semibold tracking-[-0.01em] text-fg flex-1">
              Share — something went wrong
            </h2>
          </header>
          <div className="p-5 text-[13px] text-fg font-sans leading-[1.5]">
            <p className="mt-0 mb-2.5">
              The Share dialog hit an error. Your link is:
            </p>
            <code className="block p-2.5 bg-muted border border-border rounded-md font-mono text-[11.5px] break-all">
              {this.props.fallbackUrl}
            </code>
            <p className="mt-3 mb-0 text-[11.5px] text-fg-muted">
              {this.state.error.message}
            </p>
          </div>
          <footer className="py-2.5 px-5 border-t border-border flex justify-end">
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
      <div className="text-[10.5px] font-bold tracking-widest uppercase text-fg-muted mb-1.5">
        {label}
      </div>
      {children}
    </div>
  )
}
