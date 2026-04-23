import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { ProgressRow } from '@/components/ui/primitives'

type Transcript = components['schemas']['GetTranscriptWithParticipants']

const FLAG_NOTE =
  'New design pending for this flow. This placeholder keeps the route accessible while the pipeline finishes.'

export function StatusPlaceholder({ transcript }: { transcript: Transcript }) {
  const kind = kindFor(transcript)
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {kind.icon}
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
          }}
        >
          {kind.title}
        </h2>
      </div>
      <p
        style={{
          margin: 0,
          color: 'var(--fg-muted)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        {kind.body}
      </p>
      {kind.showProgress && <ProgressRow stage={kind.stage!} progress={null} />}
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--fg-muted)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.5,
          paddingTop: 14,
          borderTop: '1px solid var(--border)',
        }}
      >
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
        <span style={{ color: 'var(--fg-muted)', display: 'inline-flex' }}>
          {I.FileAudio(22)}
        </span>
      ),
      title: 'Waiting for upload',
      body: 'This transcript is pending an audio file. Upload from the transcript detail view on the legacy app, or trigger the upload flow from a new recording.',
      showProgress: false as const,
    }
  }
  if (status === 'uploaded' || status === 'processing') {
    return {
      icon: (
        <span style={{ color: 'var(--status-processing)', display: 'inline-flex' }}>
          {I.Loader(22)}
        </span>
      ),
      title: 'Processing the recording…',
      body: 'The pipeline is transcribing, diarizing and summarizing. This page will update automatically when the transcript is ready.',
      showProgress: true as const,
      stage: status === 'uploaded' ? 'Uploaded' : 'Transcribing',
    }
  }
  return {
    icon: (
      <span style={{ color: 'var(--fg-muted)', display: 'inline-flex' }}>
        {I.Clock(22)}
      </span>
    ),
    title: 'Not ready',
    body: 'This transcript is not in a viewable state yet.',
    showProgress: false as const,
  }
}

function pulseDot() {
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 22,
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 9999,
          background: 'var(--status-live)',
          animation: 'rfPulse 1.4s ease-in-out infinite',
        }}
      />
    </span>
  )
}
