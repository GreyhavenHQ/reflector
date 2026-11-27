import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { I } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { Button } from '@/components/ui/primitives'
import { LanguagePair } from '@/components/home/LanguagePair'
import { RoomPicker } from '@/components/home/RoomPicker'
import { useRooms } from '@/hooks/useRooms'
import { apiClient } from '@/api/client'
import type { SidebarFilter } from '@/lib/types'

export function HomePage() {
  const navigate = useNavigate()
  const { data: rooms = [] } = useRooms()
  const [filter, setFilter] = useState<SidebarFilter>({ kind: 'all', value: null })
  const [collapsed, setCollapsed] = useState(false)
  const [title, setTitle] = useState('')
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('')
  const [roomId, setRoomId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleFilter = (f: SidebarFilter) => {
    setFilter(f)
    if (f.kind === 'trash') navigate('/browse?trash=1')
    else if (f.kind === 'source') navigate(`/browse?source=${f.value}`)
    else if (f.kind === 'room') navigate(`/browse?source=room&room=${f.value}`)
    else if (f.kind === 'all' || f.kind === 'recent') navigate('/browse')
  }

  const handleStart = async () => {
    setSubmitting(true)
    try {
      const { data, response } = await apiClient.POST('/v1/transcripts', {
        body: {
          name: title || null,
          source_language: sourceLang === 'auto' ? null : sourceLang,
          target_language: targetLang || null,
          room_id: roomId || null,
        } as never,
      })
      if (!response.ok || !data) {
        throw new Error('Could not create transcript')
      }
      const id = (data as { id: string }).id
      navigate(`/browse?active=${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create transcript')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = () => {
    toast.info('Upload flow lives on the transcript detail page — ship next pass.')
  }

  return (
    <AppShell
      title="New transcript"
      crumb={['home', 'new']}
      sidebar={
        <AppSidebar
          filter={filter}
          onFilter={handleFilter}
          rooms={rooms}
          tags={[]}
          showTags={false}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onNewRecording={handleStart}
        />
      }
    >
      <div className="max-w-[560px] mx-auto mt-5 px-1 pb-20">
        <header className="mb-6">
          <h1 className="font-serif text-[32px] font-semibold tracking-[-0.02em] m-0 text-fg">
            New transcript
          </h1>
          <p className="text-sm text-fg-muted mt-1.5 font-sans">
            Record live or upload a file. You can edit details later.
          </p>
        </header>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="rf-label" htmlFor="rf-title">
                Title
              </label>
              <input
                id="rf-title"
                className="rf-input mt-1.5"
                type="text"
                placeholder="e.g. Sprint review — June 12"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <LanguagePair
              sourceLang={sourceLang}
              setSourceLang={setSourceLang}
              targetLang={targetLang}
              setTargetLang={setTargetLang}
            />

            <RoomPicker roomId={roomId} setRoomId={setRoomId} rooms={rooms} />
          </div>

          <div className="flex gap-2.5 mt-6 pt-5 border-t border-border">
            <Button
              variant="primary"
              size="md"
              onClick={handleStart}
              disabled={submitting}
              className="flex-1"
            >
              {I.Mic(14)} {submitting ? 'Starting…' : 'Start recording'}
            </Button>
            <Button variant="secondary" size="md" onClick={handleUpload} className="flex-1">
              {I.Upload(14)} Upload audio
            </Button>
          </div>

          <div className="mt-3.5 text-[11.5px] text-fg-muted flex items-center gap-1.5 font-sans">
            {I.Lock(12)}
            Audio is processed on your infrastructure.
          </div>
        </div>
      </div>
    </AppShell>
  )
}
