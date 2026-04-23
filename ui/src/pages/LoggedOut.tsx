import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { ReflectorMark } from '@/components/layout/ReflectorMark'
import { useAuth } from '@/auth/AuthContext'

export function LoggedOutPage() {
  const { mode, loginWithOidc } = useAuth()
  const navigate = useNavigate()
  const [learnOpen, setLearnOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  const handleSignIn = () => {
    if (mode === 'oidc') loginWithOidc()
    else navigate('/login')
  }

  return (
    <>
      <main
        style={{
          maxWidth: 520,
          margin: '0 auto',
          minHeight: '100vh',
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            background: 'var(--reflector-accent-tint)',
            borderRadius: '50%',
          }}
        >
          <ReflectorMark size={40} />
        </div>

        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
            marginBottom: 14,
          }}
        >
          Reflector · by Greyhaven
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            margin: 0,
            lineHeight: 1.05,
            color: 'var(--fg)',
          }}
        >
          Transcripts &amp; translation,
          <br />
          <span style={{ fontStyle: 'italic', color: 'var(--fg-muted)' }}>
            on your own infrastructure.
          </span>
        </h1>

        <p
          style={{
            fontSize: 15.5,
            color: 'var(--fg-muted)',
            marginTop: 18,
            fontFamily: 'var(--font-sans)',
            maxWidth: 420,
            lineHeight: 1.55,
          }}
        >
          Record meetings, upload audio, translate between 40+ languages. Hosted, operated and
          owned by your team. No third-party AI vendor touches the audio.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 28, alignItems: 'center' }}>
          <Button variant="primary" size="md" onClick={handleSignIn}>
            Sign in to continue
          </Button>
          <Button variant="ghost" size="md" onClick={() => setLearnOpen(true)}>
            What is this?
          </Button>
        </div>

        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: '1px solid var(--border)',
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {I.Lock(12)} Self-hosted
          </span>
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'inherit',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Privacy &amp; retention
          </button>
          <a
            href="https://greyhaven.co"
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            greyhaven.co {I.ExternalLink(11)}
          </a>
        </div>
      </main>

      {learnOpen && <LearnMoreDialog onClose={() => setLearnOpen(false)} />}
      {privacyOpen && <PrivacyDialog onClose={() => setPrivacyOpen(false)} />}
    </>
  )
}

function PrivacyDialog({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="rf-modal-backdrop" onClick={onClose} />
      <div className="rf-modal" role="dialog" aria-modal="true">
        <div
          style={{
            padding: '20px 24px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              color: 'var(--fg)',
            }}
          >
            Privacy Policy
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
            }}
          >
            {I.Close(18)}
          </button>
        </div>
        <div
          style={{
            padding: '18px 24px 22px',
            color: 'var(--fg)',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.6,
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 180px)',
          }}
        >
          <p
            style={{
              marginTop: 0,
              marginBottom: 14,
              fontStyle: 'italic',
              color: 'var(--fg-muted)',
              fontSize: 13,
            }}
          >
            Last updated on September 22, 2023
          </p>
          <ul style={{ paddingLeft: 18, margin: '0 0 14px' }}>
            <li style={{ marginBottom: 10 }}>
              Recording Consent: By using Reflector, you grant us permission to record your
              interactions for the purpose of showcasing Reflector's capabilities during the All
              In AI conference.
            </li>
            <li style={{ marginBottom: 10 }}>
              Data Access: You will have convenient access to your recorded sessions and
              transcriptions via a unique URL, which remains active for a period of seven days.
              After this time, your recordings and transcripts will be deleted.
            </li>
            <li style={{ marginBottom: 10 }}>
              Data Confidentiality: Rest assured that none of your audio data will be shared with
              third parties.
            </li>
          </ul>
          <p style={{ margin: 0 }}>
            Questions or Concerns: If you have any questions or concerns regarding your data,
            please feel free to reach out to us at{' '}
            <a
              href="mailto:reflector@monadical.com"
              style={{
                color: 'var(--primary)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              reflector@monadical.com
            </a>
            .
          </p>
        </div>
      </div>
    </>
  )
}

function LearnMoreDialog({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="rf-modal-backdrop" onClick={onClose} />
      <div className="rf-modal" role="dialog" aria-modal="true">
        <div
          style={{
            padding: '20px 24px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              color: 'var(--fg)',
            }}
          >
            What is Reflector?
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
            }}
          >
            {I.Close(18)}
          </button>
        </div>
        <div
          style={{
            padding: '18px 24px 22px',
            color: 'var(--fg)',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <p style={{ marginTop: 0 }}>
            Reflector turns meetings and audio files into searchable transcripts and translations.
            It runs on your infrastructure, so no third-party AI vendor touches the audio.
          </p>
          <p style={{ marginBottom: 0 }}>
            Record live from your browser, upload existing files, or connect a meeting room. The
            processing pipeline (transcription, diarization, translation, summarization) is
            open-source and self-hosted.
          </p>
        </div>
      </div>
    </>
  )
}
