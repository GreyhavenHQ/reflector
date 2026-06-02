import { useMemo, useState } from 'react'
import type { components } from '@/api/schema'
import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { SummaryPanel } from './SummaryPanel'
import { TranslationPanel } from './TranslationPanel'

type Topic = components['schemas']['GetTranscriptTopic']
type Participant = components['schemas']['Participant']

type Tab = 'summary' | 'translation'

type Props = {
  summary: string | null | undefined
  topics: Topic[]
  participants: Participant[]
  sourceLanguage: string | null | undefined
  targetLanguage: string | null | undefined
  canEdit: boolean
  saving: boolean
  onSaveSummary: (next: string) => Promise<void> | void
  onSeek: (seconds: number) => void
}

/**
 * Two-tab right-column card for the transcript detail view: "Summary"
 * (editable Markdown blob) and "Translation" (per-segment translated
 * transcript, mirrors the source topics+segments). The Translation tab
 * is only mounted when the transcript was created with a target
 * language different from its source, or when at least one segment
 * already has a translation.
 */
export function SummaryTranslationTabs({
  summary,
  topics,
  participants,
  sourceLanguage,
  targetLanguage,
  canEdit,
  saving,
  onSaveSummary,
  onSeek,
}: Props) {
  const [tab, setTab] = useState<Tab>('summary')
  const [editing, setEditing] = useState(false)

  const hasAnyTranslation = useMemo(
    () =>
      topics.some((t) =>
        (t.segments ?? []).some((s) => s.translation && s.translation.trim()),
      ),
    [topics],
  )
  const translationRequested = Boolean(
    targetLanguage && targetLanguage !== sourceLanguage,
  )
  const showTranslationTab = translationRequested || hasAnyTranslation

  // If the translation tab disappears while it's active (e.g. data refresh
  // before any translated segment arrives, then transcript ends without
  // one), drop back to summary so the user isn't staring at an empty pane.
  if (tab === 'translation' && !showTranslationTab) {
    setTab('summary')
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setEditing(false)
    setTab(next)
  }

  const showEditAction = tab === 'summary' && canEdit && !editing

  return (
    <div className="bg-card border border-border rounded-lg flex flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-2 border-b border-border">
        <div className="flex gap-0">
          <TabButton active={tab === 'summary'} onClick={() => switchTab('summary')}>
            Summary
          </TabButton>
          {showTranslationTab && (
            <TabButton
              active={tab === 'translation'}
              onClick={() => switchTab('translation')}
            >
              Translation
              {targetLanguage && (
                <span className="ml-1.5 font-mono text-[10px] text-fg-muted uppercase">
                  {targetLanguage}
                </span>
              )}
            </TabButton>
          )}
        </div>
        {showEditAction && (
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setEditing(true)}
            title="Edit summary"
          >
            {I.Edit(14)}
          </Button>
        )}
      </div>

      <div className="p-5">
        {tab === 'summary' ? (
          <SummaryPanel
            summary={summary}
            editing={editing}
            onEditingChange={setEditing}
            saving={saving}
            onSave={onSaveSummary}
          />
        ) : (
          <TranslationPanel
            topics={topics}
            participants={participants}
            onSeek={onSeek}
            hasTranslationRequest={translationRequested}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative px-3.5 pt-2 pb-2.5 border-none bg-transparent font-sans text-[13px] font-medium cursor-pointer -mb-px border-b-2 inline-flex items-center',
        active ? 'text-fg border-primary' : 'text-fg-muted border-transparent',
      )}
    >
      {children}
    </button>
  )
}
