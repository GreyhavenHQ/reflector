import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { NewTranscriptDialog } from '@/components/shared/NewTranscriptDialog'
import { ConfirmDialog } from '@/components/browse/ConfirmDialog'
import { TranscriptHeader } from '@/components/transcript/TranscriptHeader'
import { MetadataStrip } from '@/components/transcript/MetadataStrip'
import { StatusPlaceholder } from '@/components/transcript/StatusPlaceholder'
import {
  AudioDeletedBanner,
  ErrorBanner,
} from '@/components/transcript/Banners'
import { AudioPlayer } from '@/components/transcript/AudioPlayer'
import { TopicsList } from '@/components/transcript/TopicsList'
import { SummaryPanel } from '@/components/transcript/SummaryPanel'
import { VideoPanel } from '@/components/transcript/VideoPanel'
import { ShareDialog } from '@/components/transcript/ShareDialog'
import { useAuth } from '@/auth/AuthContext'
import { useRooms } from '@/hooks/useRooms'
import {
  useTranscript,
  useTranscriptMutations,
  useTranscriptParticipants,
  useTranscriptTopics,
  useTranscriptWaveform,
} from '@/hooks/useTranscript'
import { useTranscriptWs } from '@/hooks/useTranscriptWs'
import { messageFor } from '@/lib/apiErrors'
import { buildTranscriptMarkdown } from '@/lib/transcriptMarkdown'
import type { SidebarFilter } from '@/lib/types'

const TERMINAL = new Set(['ended', 'error'])

export function TranscriptPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: rooms = [] } = useRooms()
  const [collapsed, setCollapsed] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [seekTarget, setSeekTarget] = useState<{
    seconds: number
    nonce: number
  } | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoOpen, setVideoOpen] = useState(false)

  const transcriptQuery = useTranscript(id)
  const transcript = transcriptQuery.data
  const status = transcript?.status ?? 'idle'
  const isTerminal = TERMINAL.has(status)
  const audioAvailable = !!transcript && !transcript.audio_deleted && status === 'ended'

  const topicsQuery = useTranscriptTopics(id, isTerminal)
  const waveformQuery = useTranscriptWaveform(id, audioAvailable)
  const participantsQuery = useTranscriptParticipants(id, !!transcript)

  const topics = topicsQuery.data ?? []
  const participants = participantsQuery.data ?? []
  const peaks = waveformQuery.data?.data ?? null

  const { update, softDelete, sendEmail, postToZulip } = useTranscriptMutations(id)

  useTranscriptWs(id)

  const canEdit = useMemo(() => {
    if (!transcript) return false
    if (!user?.sub) return false
    return transcript.user_id === user.sub
  }, [transcript, user?.sub])

  const speakerCount = transcript?.participants?.length ?? participants.length ?? 0

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

  const seekTo = (seconds: number) => {
    setSeekTarget({ seconds, nonce: Date.now() })
  }

  const activeTopicId = useMemo(() => {
    if (topics.length === 0) return null
    let best = topics[0]
    for (const t of topics) {
      if ((t.timestamp ?? 0) <= currentTime) best = t
    }
    return best.id ?? null
  }, [topics, currentTime])

  const handleRename = async (next: string) => {
    try {
      await update.mutateAsync({ title: next })
      toast.success('Title updated')
    } catch (err) {
      toast.error(messageFor(err, 'Rename failed'))
      throw err
    }
  }

  const handleSummarySave = async (next: string) => {
    try {
      await update.mutateAsync({ long_summary: next })
      toast.success('Summary updated')
    } catch (err) {
      toast.error(messageFor(err, 'Summary save failed'))
      throw err
    }
  }

  const handleCopyMarkdown = async () => {
    if (!transcript) return
    const md = buildTranscriptMarkdown(transcript, topics, participants)
    try {
      await navigator.clipboard.writeText(md)
      toast.success('Copied transcript as markdown')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const handleDownloadZip = async () => {
    if (!id) return
    try {
      const token = sessionStorage.getItem('reflector.password_token') || bearerFromOidc()
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {}
      const res = await fetch(`/v1/transcripts/${id}/download/zip`, { headers })
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transcript_${id.slice(0, 8)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const handleDelete = async () => {
    try {
      await softDelete.mutateAsync()
      toast.success('Moved to trash')
      navigate('/browse?trash=1')
    } catch (err) {
      toast.error(messageFor(err, 'Delete failed'))
    }
  }

  if (!id) {
    return <Navigate />
  }

  if (transcriptQuery.isLoading) {
    return (
      <AppShell
        title="Transcript"
        sidebar={
          <AppSidebar
            filter={sidebarFilter}
            onFilter={onSidebarFilter}
            rooms={rooms}
            tags={[]}
            showTags={false}
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            onNewRecording={() => setNewOpen(true)}
          />
        }
      >
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Loading transcript…
        </div>
        {newOpen && <NewTranscriptDialog onClose={() => setNewOpen(false)} />}
      </AppShell>
    )
  }

  if (transcriptQuery.isError || !transcript) {
    const status404 =
      (transcriptQuery.error as { status?: number } | null)?.status === 404
    return (
      <AppShell
        title="Transcript"
        sidebar={
          <AppSidebar
            filter={sidebarFilter}
            onFilter={onSidebarFilter}
            rooms={rooms}
            tags={[]}
            showTags={false}
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            onNewRecording={() => setNewOpen(true)}
          />
        }
      >
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {status404 ? 'Transcript not found.' : 'Failed to load transcript.'}
        </div>
        {newOpen && <NewTranscriptDialog onClose={() => setNewOpen(false)} />}
      </AppShell>
    )
  }

  const topicTimestamps = topics
    .map((t) => t.timestamp ?? 0)
    .filter((s) => s > 0)

  const showVideo =
    transcript.has_cloud_video && isTerminal && !!user?.sub && canEdit

  return (
    <AppShell
      title="Transcript"
      crumb={['browse', 'detail']}
      sidebar={
        <AppSidebar
          filter={sidebarFilter}
          onFilter={onSidebarFilter}
          rooms={rooms}
          tags={[]}
          showTags={false}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onNewRecording={() => setNewOpen(true)}
        />
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xs)',
            overflow: 'hidden',
          }}
        >
          <TranscriptHeader
            transcript={transcript}
            canEdit={canEdit}
            canDownload={canEdit}
            onRename={handleRename}
            onCopyMarkdown={handleCopyMarkdown}
            onOpenShare={() => setShareOpen(true)}
            onDownloadZip={handleDownloadZip}
            onDelete={() => setConfirmDelete(true)}
            onToggleVideo={
              showVideo ? () => setVideoOpen((v) => !v) : null
            }
            videoOpen={videoOpen}
          />
          <div style={{ padding: '12px 20px 16px' }}>
            <MetadataStrip transcript={transcript} speakerCount={speakerCount} />
          </div>
        </div>

        {videoOpen && <VideoPanel transcriptId={transcript.id} enabled={showVideo} />}

        {status === 'error' && <ErrorBanner message={null} />}

        {!isTerminal ? (
          <StatusPlaceholder transcript={transcript} />
        ) : (
          <>
            {transcript.audio_deleted ? (
              <AudioDeletedBanner />
            ) : status === 'ended' ? (
              <AudioPlayer
                transcriptId={transcript.id}
                peaks={peaks}
                ticks={topicTimestamps}
                seekTarget={seekTarget}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
                gap: 16,
              }}
              className="rf-detail-grid"
            >
              <div
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-xs)',
                  overflow: 'hidden',
                }}
              >
                {topicsQuery.isLoading ? (
                  <div
                    style={{
                      padding: 40,
                      textAlign: 'center',
                      color: 'var(--fg-muted)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    Loading topics…
                  </div>
                ) : (
                  <TopicsList
                    topics={topics}
                    participants={participants}
                    activeTopicId={activeTopicId}
                    currentTime={currentTime}
                    onSeek={seekTo}
                  />
                )}
              </div>

              <SummaryPanel
                summary={transcript.long_summary}
                canEdit={canEdit}
                saving={update.isPending}
                onSave={handleSummarySave}
              />
            </div>
          </>
        )}
      </div>

      {newOpen && <NewTranscriptDialog onClose={() => setNewOpen(false)} />}

      {shareOpen && (
        <ShareDialog
          transcript={transcript}
          canEdit={canEdit}
          onClose={() => setShareOpen(false)}
          onChangeShareMode={async (mode) => {
            await update.mutateAsync({ share_mode: mode })
          }}
          onSendEmail={async (email) => {
            await sendEmail.mutateAsync(email)
          }}
          onPostToZulip={async (stream, topic) => {
            await postToZulip.mutateAsync({
              stream,
              topic,
              include_topics: true,
            })
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Move to trash?"
          message={
            <>
              <strong style={{ color: 'var(--fg)' }}>
                {transcript.title?.trim() || 'Untitled transcript'}
              </strong>{' '}
              will be moved to the trash. You can restore it later.
            </>
          }
          confirmLabel="Move to trash"
          danger
          loading={softDelete.isPending}
          onConfirm={() => {
            setConfirmDelete(false)
            void handleDelete()
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </AppShell>
  )
}

function Navigate() {
  // Defensive: route guard hits this when :id is missing.
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      Missing transcript id.
    </div>
  )
}

function bearerFromOidc(): string | null {
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
  return null
}
