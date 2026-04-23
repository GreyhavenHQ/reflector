import type { components } from '@/api/schema'

type Transcript = components['schemas']['GetTranscriptWithParticipants']
type Topic = components['schemas']['GetTranscriptTopic']
type Segment = components['schemas']['GetTranscriptSegmentTopic']
type Participant = components['schemas']['Participant']

function pad2(n: number) {
  return String(Math.floor(n)).padStart(2, '0')
}

function fmtTs(seconds: number): string {
  if (!seconds || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m < 60) return `${pad2(m)}:${pad2(s)}`
  const h = Math.floor(m / 60)
  return `${pad2(h)}:${pad2(m % 60)}:${pad2(s)}`
}

function speakerNameFor(
  speaker: number,
  participants: Participant[] | null | undefined,
): string {
  if (!participants) return `Speaker ${speaker}`
  const found = participants.find((p) => p.speaker === speaker)
  return found?.name?.trim() || `Speaker ${speaker}`
}

/**
 * Build a markdown string for a transcript + topics, suitable for copy-to-clipboard.
 * Mirrors www's `buildTranscriptWithTopics` in tone and structure.
 */
export function buildTranscriptMarkdown(
  transcript: Transcript,
  topics: Topic[] | null | undefined,
  participants: Participant[] | null | undefined,
): string {
  const lines: string[] = []
  const title = transcript.title?.trim() || transcript.name?.trim() || 'Transcript'
  lines.push(`# ${title}`)
  lines.push('')

  if (transcript.long_summary?.trim()) {
    lines.push('## Summary')
    lines.push('')
    lines.push(transcript.long_summary.trim())
    lines.push('')
  }

  const ts = topics ?? []
  if (ts.length === 0) {
    return lines.join('\n').trimEnd() + '\n'
  }

  for (const topic of ts) {
    const headerTs = fmtTs(topic.timestamp ?? 0)
    lines.push(`## ${topic.title} (${headerTs})`)
    if (topic.summary?.trim()) {
      lines.push('')
      lines.push(topic.summary.trim())
    }
    lines.push('')
    const segments: Segment[] = topic.segments ?? []
    if (segments.length > 0) {
      for (const seg of segments) {
        const name = speakerNameFor(seg.speaker, participants)
        lines.push(`**${name}**: ${seg.text}`)
      }
    } else if (topic.transcript?.trim()) {
      lines.push(topic.transcript.trim())
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
