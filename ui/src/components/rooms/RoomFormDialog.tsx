import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { apiClient } from '@/api/client'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { Combobox } from '@/components/ui/Combobox'
import { cn } from '@/lib/utils'

type Room = components['schemas']['RoomDetails']

export type RoomFormPayload = {
  name: string
  platform: 'whereby' | 'daily' | 'livekit'
  room_mode: string
  recording_type: string
  recording_trigger: string
  is_locked: boolean
  is_shared: boolean
  skip_consent: boolean
  store_video: boolean
  zulip_auto_post: boolean
  zulip_stream: string
  zulip_topic: string
  webhook_url: string
  webhook_secret: string
  ics_url: string | null
  ics_enabled: boolean
  ics_fetch_interval: number
  email_transcript_to: string | null
}

type Props = {
  room: Room | null
  onClose: () => void
  onSave: (payload: RoomFormPayload) => Promise<void>
  saving?: boolean
}

const NAME_RE = /^[a-z0-9-_]+$/i

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'share', label: 'Share' },
  { id: 'webhook', label: 'WebHook' },
] as const

type TabId = (typeof TABS)[number]['id']

export function RoomFormDialog({ room, onClose, onSave, saving }: Props) {
  const isEdit = !!room
  const [tab, setTab] = useState<TabId>('general')

  const [name, setName] = useState(room?.name ?? '')
  const [platform, setPlatform] = useState<Room['platform']>(room?.platform ?? 'whereby')
  const [roomMode, setRoomMode] = useState(room?.room_mode ?? 'normal')
  const [recType, setRecType] = useState(room?.recording_type ?? 'cloud')
  const [recTrigger, setRecTrigger] = useState(
    room?.recording_trigger ?? 'automatic-2nd-participant',
  )
  const [isLocked, setIsLocked] = useState(room?.is_locked ?? false)
  const [isShared, setIsShared] = useState(room?.is_shared ?? false)
  const [skipConsent, setSkipConsent] = useState(room?.skip_consent ?? false)
  const [storeVideo, setStoreVideo] = useState(room?.store_video ?? false)

  const [icsEnabled, setIcsEnabled] = useState(room?.ics_enabled ?? false)
  const [icsUrl, setIcsUrl] = useState(room?.ics_url ?? '')
  const [icsFetchInterval, setIcsFetchInterval] = useState(room?.ics_fetch_interval ?? 5)

  const [zulipAutoPost, setZulipAutoPost] = useState(room?.zulip_auto_post ?? false)
  const [zulipStream, setZulipStream] = useState(room?.zulip_stream ?? '')
  const [zulipTopic, setZulipTopic] = useState(room?.zulip_topic ?? '')

  const [webhookUrl, setWebhookUrl] = useState(room?.webhook_url ?? '')
  const [webhookSecret, setWebhookSecret] = useState(room?.webhook_secret ?? '')

  const [emailTranscriptTo, setEmailTranscriptTo] = useState(room?.email_transcript_to ?? '')

  const [formError, setFormError] = useState<string | null>(null)

  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/config')
      if (!response.ok || !data) throw new Error('Config unavailable')
      return data
    },
    staleTime: 5 * 60_000,
  })

  const zulipEnabled = configQuery.data?.zulip_enabled ?? false
  const emailEnabled = configQuery.data?.email_enabled ?? false

  const visibleTabs = TABS.filter((t) => t.id !== 'share' || zulipEnabled)
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab('general')
  }, [visibleTabs, tab])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, saving])

  const nameError =
    !isEdit && name && !NAME_RE.test(name)
      ? 'No spaces or special characters allowed'
      : ''
  const canSave = name.trim().length > 0 && !nameError && !saving

  const submit = async () => {
    setFormError(null)
    if (!canSave) return
    try {
      const effectivePlatform = platform
      const effectiveRoomMode = effectivePlatform === 'daily' ? 'group' : roomMode
      const effectiveTrigger =
        effectivePlatform === 'daily'
          ? recType === 'cloud'
            ? 'automatic-2nd-participant'
            : 'none'
          : recTrigger
      await onSave({
        name,
        platform: effectivePlatform,
        room_mode: effectiveRoomMode,
        recording_type: recType,
        recording_trigger: effectiveTrigger,
        is_locked: isLocked,
        is_shared: isShared,
        skip_consent: skipConsent,
        store_video: storeVideo,
        zulip_auto_post: zulipAutoPost,
        zulip_stream: zulipStream,
        zulip_topic: zulipTopic,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        ics_url: icsUrl || null,
        ics_enabled: icsEnabled,
        ics_fetch_interval: icsFetchInterval,
        email_transcript_to: emailTranscriptTo || null,
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <>
      <div className="rf-modal-backdrop" onClick={() => !saving && onClose()} />
      <div
        className="rf-modal w-[min(600px,calc(100vw-32px))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-room-title"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="flex flex-col"
        >
          <header className="pt-[18px] px-5 flex items-start">
            <div className="flex-1">
              <h2
                id="rf-room-title"
                className="m-0 font-serif text-xl font-semibold tracking-[-0.01em] text-fg"
              >
                {isEdit ? 'Edit room' : 'New room'}
              </h2>
              {isEdit && (
                <p className="mt-0.5 mb-0 text-xs text-fg-muted font-mono">
                  /{room!.name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="border-none bg-transparent p-1.5 cursor-pointer text-fg-muted rounded-sm inline-flex"
            >
              {I.X(16)}
            </button>
          </header>

          <div className="flex gap-0 pt-3.5 px-5 border-b border-border">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative px-3.5 pt-2 pb-2.5 border-none bg-transparent font-sans text-[13px] font-medium cursor-pointer -mb-px border-b-2',
                  tab === t.id
                    ? 'text-fg border-primary'
                    : 'text-fg-muted border-transparent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {formError && (
            <div
              role="alert"
              className="mt-3 mx-5 text-[13px] text-destructive bg-[color-mix(in_srgb,var(--destructive)_8%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_25%,transparent)] rounded-md px-3 py-2"
            >
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-4 p-5 overflow-auto flex-1 max-h-[calc(100vh-260px)]">
            {tab === 'general' && (
              <GeneralTab
                name={name}
                setName={setName}
                nameError={nameError}
                isEdit={isEdit}
                platform={platform}
                setPlatform={setPlatform}
                isLocked={isLocked}
                setIsLocked={setIsLocked}
                roomMode={roomMode}
                setRoomMode={setRoomMode}
                recType={recType}
                setRecType={setRecType}
                recTrigger={recTrigger}
                setRecTrigger={setRecTrigger}
                isShared={isShared}
                setIsShared={setIsShared}
                skipConsent={skipConsent}
                setSkipConsent={setSkipConsent}
                storeVideo={storeVideo}
                setStoreVideo={setStoreVideo}
                emailEnabled={emailEnabled}
                emailTranscriptTo={emailTranscriptTo}
                setEmailTranscriptTo={setEmailTranscriptTo}
              />
            )}
            {tab === 'calendar' && (
              <CalendarTab
                icsEnabled={icsEnabled}
                setIcsEnabled={setIcsEnabled}
                icsUrl={icsUrl}
                setIcsUrl={setIcsUrl}
                icsFetchInterval={icsFetchInterval}
                setIcsFetchInterval={setIcsFetchInterval}
              />
            )}
            {tab === 'share' && (
              <ShareTab
                zulipEnabled={zulipEnabled}
                zulipAutoPost={zulipAutoPost}
                setZulipAutoPost={setZulipAutoPost}
                zulipStream={zulipStream}
                setZulipStream={setZulipStream}
                zulipTopic={zulipTopic}
                setZulipTopic={setZulipTopic}
              />
            )}
            {tab === 'webhook' && (
              <WebhookTab
                webhookUrl={webhookUrl}
                setWebhookUrl={setWebhookUrl}
                webhookSecret={webhookSecret}
                setWebhookSecret={setWebhookSecret}
              />
            )}
          </div>

          <footer className="px-5 py-3.5 border-t border-border flex gap-2.5 items-center">
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={saving}
              className="text-fg font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!canSave}
              className={!canSave ? 'opacity-50 cursor-not-allowed' : undefined}
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add room'}
            </Button>
          </footer>
        </form>
      </div>
    </>
  )
}

/* ---------- Field primitives ---------- */

function FormField({
  label,
  hint,
  info,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  info?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="rf-label flex items-center gap-1.5">
        {label}
        {info && (
          <span title={info} className="inline-flex text-fg-muted cursor-help">
            {I.Info(12)}
          </span>
        )}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="rf-hint">{hint}</div>}
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer font-sans py-1.5">
      <span
        className={cn(
          'shrink-0 mt-px w-4 h-4 rounded-[4px] border-[1.5px] inline-flex items-center justify-center text-primary-fg transition-all duration-[var(--dur-fast)] relative',
          checked
            ? 'border-primary bg-primary'
            : 'border-[var(--gh-grey-4)] bg-card',
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute opacity-0 w-0 h-0"
        />
        {checked && I.Check(11)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-[13px] text-fg font-medium">{label}</span>
        {hint && (
          <span className="block mt-0.5 text-[11.5px] text-fg-muted leading-[1.4]">
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}

function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="px-3.5 py-3 text-xs leading-[1.5] text-fg-muted bg-muted border border-border rounded-md flex items-start gap-2.5">
      <span className="text-primary mt-px shrink-0">
        {I.Info(14)}
      </span>
      <div>{children}</div>
    </div>
  )
}

/* ---------- Tabs ---------- */

type GeneralTabProps = {
  name: string
  setName: (v: string) => void
  nameError: string
  isEdit: boolean
  platform: Room['platform']
  setPlatform: (v: Room['platform']) => void
  isLocked: boolean
  setIsLocked: (v: boolean) => void
  roomMode: string
  setRoomMode: (v: string) => void
  recType: string
  setRecType: (v: string) => void
  recTrigger: string
  setRecTrigger: (v: string) => void
  isShared: boolean
  setIsShared: (v: boolean) => void
  skipConsent: boolean
  setSkipConsent: (v: boolean) => void
  storeVideo: boolean
  setStoreVideo: (v: boolean) => void
  emailEnabled: boolean
  emailTranscriptTo: string
  setEmailTranscriptTo: (v: string) => void
}

function GeneralTab(p: GeneralTabProps) {
  const isDaily = p.platform === 'daily'
  return (
    <>
      <FormField
        label="Room name"
        hint={p.nameError || (!p.isEdit ? 'No spaces or special characters allowed' : undefined)}
      >
        <input
          className={cn('rf-input', p.nameError && 'border-destructive')}
          type="text"
          autoFocus={!p.isEdit}
          disabled={p.isEdit}
          placeholder="room-name"
          value={p.name}
          onChange={(e) => p.setName(e.target.value)}
        />
        {p.isEdit && (
          <div className="rf-hint text-fg-muted">
            Room name can't be changed after creation.
          </div>
        )}
      </FormField>

      <FormField label="Platform">
        <select
          className="rf-select"
          value={p.platform}
          onChange={(e) => p.setPlatform(e.target.value as Room['platform'])}
        >
          <option value="whereby">Whereby</option>
          <option value="daily">Daily</option>
          <option value="livekit">LiveKit</option>
        </select>
      </FormField>

      <Checkbox
        checked={p.isLocked}
        onChange={p.setIsLocked}
        label="Locked room"
        hint="Only the host can admit participants."
      />

      {!isDaily && (
        <FormField label="Room size">
          <select
            className="rf-select"
            value={p.roomMode}
            onChange={(e) => p.setRoomMode(e.target.value)}
          >
            <option value="normal">2–4 people</option>
            <option value="group">2–200 people</option>
          </select>
        </FormField>
      )}

      <FormField
        label="Recording type"
        info="Local recording stays on the host's device. Cloud recording uploads to Reflector."
      >
        <select
          className="rf-select"
          value={p.recType}
          onChange={(e) => p.setRecType(e.target.value)}
        >
          <option value="none">None</option>
          <option value="local">Local</option>
          <option value="cloud">Cloud</option>
        </select>
      </FormField>

      {p.recType !== 'none' && !isDaily && (
        <FormField label="Recording start trigger" info="When should recording begin?">
          <select
            className="rf-select"
            value={p.recTrigger}
            onChange={(e) => p.setRecTrigger(e.target.value)}
          >
            <option value="none">Manual — host starts recording</option>
            <option value="prompt">Prompt — ask the host to start</option>
            <option value="automatic-2nd-participant">
              Automatic — when a second participant joins
            </option>
          </select>
        </FormField>
      )}

      <Checkbox
        checked={p.isShared}
        onChange={p.setIsShared}
        label="Shared room"
        hint="Visible to everyone in the workspace."
      />
      <Checkbox
        checked={p.skipConsent}
        onChange={p.setSkipConsent}
        label="Skip consent dialog"
        hint="When enabled, participants won't be asked for recording consent. Audio will be stored automatically."
      />
      <Checkbox
        checked={p.storeVideo}
        onChange={p.setStoreVideo}
        label="Store video"
        hint="Keep the video track alongside audio. Increases storage cost."
      />

      {p.emailEnabled && (
        <FormField
          label="Email transcript to"
          hint="Receive a copy of each transcript summary at this address."
        >
          <input
            className="rf-input"
            type="email"
            placeholder="team@example.com"
            value={p.emailTranscriptTo}
            onChange={(e) => p.setEmailTranscriptTo(e.target.value)}
          />
        </FormField>
      )}
    </>
  )
}

type CalendarTabProps = {
  icsEnabled: boolean
  setIcsEnabled: (v: boolean) => void
  icsUrl: string
  setIcsUrl: (v: string) => void
  icsFetchInterval: number
  setIcsFetchInterval: (v: number) => void
}

function CalendarTab(p: CalendarTabProps) {
  return (
    <>
      <InfoBanner>
        Reflector polls the calendar on the configured interval. Meeting titles from the feed
        replace the generic "Meeting" label on recordings.
      </InfoBanner>

      <Checkbox
        checked={p.icsEnabled}
        onChange={p.setIcsEnabled}
        label="Enable calendar sync"
        hint="Pull meeting titles from an ICS feed (Google Calendar, Outlook, Fastmail, etc.)."
      />

      {p.icsEnabled && (
        <>
          <FormField
            label="ICS feed URL"
            hint="Paste the secret calendar URL from your provider. Keep it private."
          >
            <input
              className="rf-input"
              type="url"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={p.icsUrl}
              onChange={(e) => p.setIcsUrl(e.target.value)}
            />
          </FormField>

          <FormField label="Fetch interval" hint="Minutes between calendar syncs.">
            <input
              className="rf-input"
              type="number"
              min={1}
              value={p.icsFetchInterval}
              onChange={(e) => p.setIcsFetchInterval(Math.max(1, Number(e.target.value) || 1))}
            />
          </FormField>
        </>
      )}
    </>
  )
}

type ShareTabProps = {
  zulipEnabled: boolean
  zulipAutoPost: boolean
  setZulipAutoPost: (v: boolean) => void
  zulipStream: string
  setZulipStream: (v: string) => void
  zulipTopic: string
  setZulipTopic: (v: string) => void
}

function ShareTab(p: ShareTabProps) {
  const { data: streams = [] } = useQuery({
    queryKey: ['zulip', 'streams'],
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/zulip/streams')
      if (!response.ok || !data) throw new Error('Failed to load Zulip streams')
      return data
    },
    enabled: p.zulipEnabled,
    staleTime: 5 * 60_000,
  })
  const selectedStreamId =
    streams.find((s) => s.name === p.zulipStream)?.stream_id ?? null
  const { data: topics = [] } = useQuery({
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
    enabled: p.zulipEnabled && selectedStreamId != null,
    staleTime: 60_000,
  })

  if (!p.zulipEnabled) {
    return (
      <InfoBanner>
        Zulip integration isn't configured on this Reflector instance. Set <code>ZULIP_REALM</code>{' '}
        and related env vars on the server to enable auto-posting transcript summaries.
      </InfoBanner>
    )
  }
  return (
    <>
      <InfoBanner>
        Post the transcript summary + link to a Zulip channel when the meeting ends.
      </InfoBanner>

      <Checkbox
        checked={p.zulipAutoPost}
        onChange={p.setZulipAutoPost}
        label="Auto-post to Zulip"
        hint="Send a summary message to a Zulip stream and topic after each meeting."
      />

      {p.zulipAutoPost && (
        <>
          <FormField label="Stream">
            <Combobox
              value={p.zulipStream}
              onChange={(v) => {
                p.setZulipStream(v)
                p.setZulipTopic('')
              }}
              options={streams.map((s) => s.name)}
              placeholder="e.g. reflector"
            />
          </FormField>
          <FormField
            label="Topic"
            hint="The topic within the stream where messages will be posted."
          >
            <Combobox
              value={p.zulipTopic}
              onChange={p.setZulipTopic}
              options={topics.map((t) => t.name)}
              placeholder="e.g. Meeting notes"
            />
          </FormField>
        </>
      )}
    </>
  )
}

type WebhookTabProps = {
  webhookUrl: string
  setWebhookUrl: (v: string) => void
  webhookSecret: string
  setWebhookSecret: (v: string) => void
}

function WebhookTab(p: WebhookTabProps) {
  return (
    <>
      <InfoBanner>
        Reflector POSTs a JSON payload to your URL on lifecycle events:{' '}
        <code className="font-mono text-[11px]">meeting.started</code>,{' '}
        <code className="font-mono text-[11px]">meeting.ended</code>,{' '}
        <code className="font-mono text-[11px]">transcript.ready</code>.
      </InfoBanner>

      <FormField
        label="Webhook URL"
        hint="HTTPS required. Signed with the webhook secret below."
      >
        <input
          className="rf-input"
          type="url"
          placeholder="https://example.com/reflector/webhook"
          value={p.webhookUrl}
          onChange={(e) => p.setWebhookUrl(e.target.value)}
        />
      </FormField>

      <FormField
        label="Webhook secret"
        hint="Used to sign each payload (HMAC-SHA256) so your receiver can verify it."
      >
        <input
          className="rf-input"
          type="text"
          placeholder="whsec_…"
          value={p.webhookSecret}
          onChange={(e) => p.setWebhookSecret(e.target.value)}
        />
      </FormField>
    </>
  )
}
