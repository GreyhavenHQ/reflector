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
      <main className="max-w-[520px] mx-auto min-h-screen px-6 py-12 flex flex-col items-center justify-center text-center">
        <div className="w-[72px] h-[72px] flex items-center justify-center mb-6 bg-[var(--reflector-accent-tint)] rounded-full">
          <ReflectorMark size={40} />
        </div>

        <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted font-mono mb-3.5">
          Reflector · by Greyhaven
        </div>

        <h1 className="font-serif text-[44px] font-semibold tracking-[-0.025em] m-0 leading-[1.05] text-fg">
          Transcripts &amp; translation,
          <br />
          <span className="italic text-fg-muted">
            on your own infrastructure.
          </span>
        </h1>

        <p className="text-[15.5px] text-fg-muted mt-[18px] font-sans max-w-[420px] leading-[1.55]">
          Record meetings, upload audio, translate between 40+ languages. Hosted, operated and
          owned by your team. No third-party AI vendor touches the audio.
        </p>

        <div className="flex gap-2.5 mt-7 items-center">
          <Button variant="primary" size="md" onClick={handleSignIn}>
            Sign in to continue
          </Button>
          <Button variant="ghost" size="md" onClick={() => setLearnOpen(true)}>
            What is this?
          </Button>
        </div>

        <div className="mt-12 pt-6 border-t border-border w-full flex justify-between text-xs text-fg-muted font-sans">
          <span className="inline-flex items-center gap-1.5">
            {I.Lock(12)} Self-hosted
          </span>
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="bg-none border-none p-0 text-inherit cursor-pointer font-[inherit] text-[length:inherit] underline underline-offset-2"
          >
            Privacy &amp; retention
          </button>
          <a
            href="https://greyhaven.co"
            target="_blank"
            rel="noreferrer"
            className="text-inherit underline underline-offset-2 inline-flex items-center gap-1"
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
        <div className="px-6 pt-5 pb-3.5 border-b border-border flex items-center justify-between">
          <h2 className="m-0 font-serif text-xl font-semibold tracking-[-0.015em] text-fg">
            Privacy Policy
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="border-none bg-transparent text-fg-muted cursor-pointer p-1 rounded-sm inline-flex"
          >
            {I.Close(18)}
          </button>
        </div>
        <div className="px-6 pt-[18px] pb-[22px] text-fg font-sans text-sm leading-[1.6] overflow-y-auto max-h-[calc(100vh-180px)]">
          <p className="mt-0 mb-3.5 italic text-fg-muted text-[13px]">
            Last updated on September 22, 2023
          </p>
          <ul className="pl-[18px] mt-0 mb-3.5">
            <li className="mb-2.5">
              Recording Consent: By using Reflector, you grant us permission to record your
              interactions for the purpose of showcasing Reflector's capabilities during the All
              In AI conference.
            </li>
            <li className="mb-2.5">
              Data Access: You will have convenient access to your recorded sessions and
              transcriptions via a unique URL, which remains active for a period of seven days.
              After this time, your recordings and transcripts will be deleted.
            </li>
            <li className="mb-2.5">
              Data Confidentiality: Rest assured that none of your audio data will be shared with
              third parties.
            </li>
          </ul>
          <p className="m-0">
            Questions or Concerns: If you have any questions or concerns regarding your data,
            please feel free to reach out to us at{' '}
            <a
              href="mailto:reflector@monadical.com"
              className="text-primary underline underline-offset-2"
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
        <div className="px-6 pt-5 pb-3.5 border-b border-border flex items-center justify-between">
          <h2 className="m-0 font-serif text-xl font-semibold tracking-[-0.015em] text-fg">
            What is Reflector?
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="border-none bg-transparent text-fg-muted cursor-pointer p-1 rounded-sm inline-flex"
          >
            {I.Close(18)}
          </button>
        </div>
        <div className="px-6 pt-[18px] pb-[22px] text-fg font-sans text-sm leading-[1.6]">
          <p className="mt-0">
            Reflector turns meetings and audio files into searchable transcripts and translations.
            It runs on your infrastructure, so no third-party AI vendor touches the audio.
          </p>
          <p className="mb-0">
            Record live from your browser, upload existing files, or connect a meeting room. The
            processing pipeline (transcription, diarization, translation, summarization) is
            open-source and self-hosted.
          </p>
        </div>
      </div>
    </>
  )
}
