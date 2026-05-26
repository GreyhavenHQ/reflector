import { TranscriptPage } from './TranscriptPage'

/**
 * Anonymous-viewer entry point for `share_mode=public` transcripts.
 * Reuses TranscriptPage in its read-only mode — no sidebar, no edit
 * actions, no share/delete dialogs.
 */
export function SharedTranscriptPage() {
  return <TranscriptPage anonymous />
}
