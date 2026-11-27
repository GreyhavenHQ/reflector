import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { ProgressRow } from '@/components/ui/primitives'

type Transcript = components['schemas']['GetTranscriptWithParticipants']

const FLAG_NOTE =
  'New design pending for this flow. This placeholder keeps the route accessible while the pipeline finishes.'

export function StatusPlaceholder({ transcript }: { transcript: Transcript }) {
  const kind = kindFor(transcript)
  return (
    <div className="flex flex-col gap-[18px] p-8 bg-card border border-border rounded-lg">
      <div className="flex items-center gap-3">
        {kind.icon}
        <h2 className="m-0 font-serif text-[22px] font-semibold tracking-[-0.01em] text-fg">
          {kind.title}
        </h2>
      </div>
      <p className="m-0 font-sans text-sm leading-[1.55] text-fg-muted">{kind.body}</p>
      {kind.showProgress && <ProgressRow stage={kind.stage!} progress={null} />}
      <div className="pt-3.5 border-t border-border font-mono text-[11.5px] leading-[1.5] text-fg-muted">
        {FLAG_NOTE}
      </div>
    </div>
  )
}

function kindFor(t: Transcript) {
  const status = t.status
  if (status === 'recording' || (status === 'idle' && t.source_kind === 'live')) {
    return {
      icon: pulseDot(),
      title: 'Live recording in progress',
      body: 'This transcript is being captured live. The full detail view will appear once the session ends.',
      showProgress: false as const,
    }
  }
  if (status === 'idle' && t.source_kind === 'file') {
    return {
      icon: (
        <span className="inline-flex text-fg-muted">{I.FileAudio(22)}</span>
      ),
      title: 'Waiting for upload',
      body: 'This transcript is pending an audio file. Upload from the transcript detail view on the legacy app, or trigger the upload flow from a new recording.',
      showProgress: false as const,
    }
  }
  if (status === 'uploaded' || status === 'processing') {
    return {
      icon: (
        <span className="inline-flex text-status-processing">{I.Loader(22)}</span>
      ),
      title: 'Processing the recording…',
      body: 'The pipeline is transcribing, diarizing and summarizing. This page will update automatically when the transcript is ready.',
      showProgress: true as const,
      stage: status === 'uploaded' ? 'Uploaded' : 'Transcribing',
    }
  }
  return {
    icon: (
      <span className="inline-flex text-fg-muted">{I.Clock(22)}</span>
    ),
    title: 'Not ready',
    body: 'This transcript is not in a viewable state yet.',
    showProgress: false as const,
  }
}

function pulseDot() {
  return (
    <span className="relative inline-flex w-[22px] h-[22px] items-center justify-center">
      <span className="w-2.5 h-2.5 rounded-full bg-status-live animate-[rfPulse_1.4s_ease-in-out_infinite]" />
    </span>
  )
}
