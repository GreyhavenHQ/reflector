import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal block/inline markdown renderer for transcript summaries.
 * Supports: #..###### headings, blank-line paragraph breaks, - bulleted lists,
 * 1. numbered lists, `code` inline, **bold**, *italic*, [text](url), newlines → <br>.
 * NOT a full CommonMark parser. Keep summaries sane; anything fancier renders as text.
 */
export function Markdown({ source }: { source: string | null | undefined }) {
  if (!source) return null
  const blocks = splitBlocks(source)
  return (
    <>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block)}</Fragment>
      ))}
    </>
  )
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }

function splitBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      out.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      out.push({ kind: 'ul', items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push({ kind: 'ol', items })
      continue
    }
    // Paragraph: collect until blank line / heading / list
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    out.push({ kind: 'paragraph', text: buf.join('\n') })
  }
  return out
}

const HEADING_SIZE = ['', 'text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-[15px]', 'text-sm']

function renderBlock(b: Block): ReactNode {
  if (b.kind === 'heading') {
    return (
      <div
        className={cn(
          'font-serif font-semibold tracking-[-0.01em] text-fg mt-[18px] mb-1.5 leading-[1.3]',
          HEADING_SIZE[b.level] ?? 'text-base',
        )}
      >
        {renderInline(b.text)}
      </div>
    )
  }
  if (b.kind === 'paragraph') {
    return (
      <p className="mt-0 mb-2.5 leading-[1.55] text-fg whitespace-pre-wrap">
        {renderInline(b.text)}
      </p>
    )
  }
  if (b.kind === 'ul') {
    return (
      <ul className="mt-0 mb-2.5 pl-5 leading-[1.55]">
        {b.items.map((it, i) => (
          <li key={i}>{renderInline(it)}</li>
        ))}
      </ul>
    )
  }
  return (
    <ol className="mt-0 mb-2.5 pl-[22px] leading-[1.55]">
      {b.items.map((it, i) => (
        <li key={i}>{renderInline(it)}</li>
      ))}
    </ol>
  )
}

function renderInline(text: string): ReactNode {
  // Order matters: links → code → bold → italic. Linebreaks preserved by whiteSpace: pre-wrap.
  const out: ReactNode[] = []
  let rest = text
  while (rest.length > 0) {
    const linkMatch = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      out.push(
        <a
          key={out.length}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {renderInline(linkMatch[1])}
        </a>,
      )
      rest = rest.slice(linkMatch[0].length)
      continue
    }
    const codeMatch = rest.match(/^`([^`]+)`/)
    if (codeMatch) {
      out.push(
        <code
          key={out.length}
          className="font-mono text-[0.9em] px-[5px] py-px rounded-[3px] bg-muted border border-border"
        >
          {codeMatch[1]}
        </code>,
      )
      rest = rest.slice(codeMatch[0].length)
      continue
    }
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      out.push(
        <strong key={out.length} className="font-semibold">
          {renderInline(boldMatch[1])}
        </strong>,
      )
      rest = rest.slice(boldMatch[0].length)
      continue
    }
    const italicMatch = rest.match(/^\*([^*]+)\*/) || rest.match(/^_([^_]+)_/)
    if (italicMatch) {
      out.push(
        <em key={out.length} className="italic">
          {renderInline(italicMatch[1])}
        </em>,
      )
      rest = rest.slice(italicMatch[0].length)
      continue
    }
    // Take one character and move on.
    out.push(rest[0])
    rest = rest.slice(1)
  }
  return <>{out}</>
}
