import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  useQueryState,
  parseAsString,
  parseAsInteger,
  parseAsStringLiteral,
} from 'nuqs'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { NewTranscriptDialog } from '@/components/shared/NewTranscriptDialog'
import { FilterBar } from '@/components/browse/FilterBar'
import { Pagination } from '@/components/browse/Pagination'
import { TranscriptRow } from '@/components/browse/TranscriptRow'
import { TrashRow } from '@/components/browse/TrashRow'
import { ConfirmDialog } from '@/components/browse/ConfirmDialog'
import { apiClient } from '@/api/client'
import { extractDetail, messageFor } from '@/lib/apiErrors'
import { useRooms } from '@/hooks/useRooms'
import { useTranscripts } from '@/hooks/useTranscripts'
import type { SidebarFilter, TranscriptRowData } from '@/lib/types'

const PAGE_SIZE = 20

const sourceParser = parseAsStringLiteral(['live', 'file'] as const)
const sortParser = parseAsStringLiteral(['newest', 'oldest', 'longest'] as const).withDefault('newest')


export function BrowsePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: rooms = [] } = useRooms()
  const [collapsed, setCollapsed] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [toDelete, setToDelete] = useState<TranscriptRowData | null>(null)
  const [toDestroy, setToDestroy] = useState<TranscriptRowData | null>(null)

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ['transcripts'] })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { response, error } = await apiClient.DELETE('/v1/transcripts/{transcript_id}', {
        params: { path: { transcript_id: id } },
      })
      if (!response.ok) {
        throw Object.assign(new Error('Delete failed'), { detail: extractDetail(error) })
      }
    },
    onSuccess: () => {
      invalidateList()
      toast.success('Moved to trash')
      setToDelete(null)
    },
    onError: (err) => toast.error(messageFor(err, 'Delete failed')),
  })

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { response, error } = await apiClient.POST(
        '/v1/transcripts/{transcript_id}/restore',
        { params: { path: { transcript_id: id } } },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Restore failed'), { detail: extractDetail(error) })
      }
    },
    onSuccess: () => {
      invalidateList()
      toast.success('Restored')
    },
    onError: (err) => toast.error(messageFor(err, 'Restore failed')),
  })

  const destroyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { response, error } = await apiClient.DELETE(
        '/v1/transcripts/{transcript_id}/destroy',
        { params: { path: { transcript_id: id } } },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Destroy failed'), { detail: extractDetail(error) })
      }
    },
    onSuccess: () => {
      invalidateList()
      toast.success('Permanently destroyed')
      setToDestroy(null)
    },
    onError: (err) => toast.error(messageFor(err, 'Destroy failed')),
  })

  const [q, setQ] = useQueryState('q', parseAsString.withDefault(''))
  const [source, setSource] = useQueryState('source', sourceParser)
  const [roomId, setRoomId] = useQueryState('room', parseAsString)
  const [trash, setTrash] = useQueryState('trash', parseAsInteger)
  const [tagId, setTagId] = useQueryState('tag', parseAsString)
  const [recent, setRecent] = useQueryState('recent', parseAsInteger)
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
  const [sort, setSort] = useQueryState('sort', sortParser)

  const filter: SidebarFilter = useMemo(() => {
    if (trash) return { kind: 'trash', value: null }
    if (recent) return { kind: 'recent', value: null }
    if (tagId) return { kind: 'tag', value: tagId }
    if (source === 'live' || source === 'file') {
      if (roomId) return { kind: 'room', value: roomId }
      return { kind: 'source', value: source }
    }
    if (roomId) return { kind: 'room', value: roomId }
    return { kind: 'all', value: null }
  }, [trash, recent, tagId, source, roomId])

  const clearAll = () => {
    setTrash(null)
    setRecent(null)
    setSource(null)
    setRoomId(null)
    setTagId(null)
  }

  const onFilter = (f: SidebarFilter) => {
    setPage(1)
    if (f.kind === 'trash') {
      clearAll()
      setTrash(1)
    } else if (f.kind === 'recent') {
      clearAll()
      setRecent(1)
    } else if (f.kind === 'source') {
      clearAll()
      setSource(f.value)
    } else if (f.kind === 'room') {
      clearAll()
      setRoomId(f.value)
    } else if (f.kind === 'tag') {
      clearAll()
      setTagId(f.value)
    } else {
      clearAll()
    }
  }

  const sourceKind = filter.kind === 'source' ? filter.value : undefined
  const queryRoomId = filter.kind === 'room' ? filter.value : undefined

  const { data, isLoading } = useTranscripts({
    query: q,
    page: page,
    pageSize: PAGE_SIZE,
    sourceKind,
    roomId: queryRoomId,
    includeDeleted: filter.kind === 'trash',
    sinceDays: filter.kind === 'recent' ? 7 : null,
    sort,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  // Unfiltered grand total for "All transcripts" — fetched once, cached long.
  const allTotalQuery = useTranscripts({
    query: '',
    page: 1,
    pageSize: 1,
  })
  const allTotal = allTotalQuery.data?.total ?? null

  // Per-filter counts: only the count corresponding to the active filter is
  // updated from the current query. Non-active rows stay at `null` → rendered
  // as no-badge instead of a misleading "0".
  const sidebarCounts = {
    all: allTotal,
    liveTranscripts:
      filter.kind === 'source' && filter.value === 'live' ? total : null,
    uploadedFiles:
      filter.kind === 'source' && filter.value === 'file' ? total : null,
    trash: filter.kind === 'trash' ? total : null,
  }

  // Show the filtered count on the active room; other rooms stay unbadged.
  // The backend doesn't expose a per-room transcript count today.
  const roomsWithCounts = useMemo(
    () =>
      rooms.map((r) => ({
        ...r,
        count: filter.kind === 'room' && filter.value === r.id ? total : null,
      })),
    [rooms, filter, total],
  )

  return (
    <AppShell
      title="Browse"
      crumb={['reflector', 'transcripts']}
      sidebar={
        <AppSidebar
          filter={filter}
          onFilter={onFilter}
          rooms={roomsWithCounts}
          tags={[]}
          showTags={false}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onNewRecording={() => setNewOpen(true)}
          counts={sidebarCounts}
        />
      }
    >
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <FilterBar
          filter={filter}
          rooms={rooms}
          tags={[]}
          total={total}
          sort={sort}
          onSort={(s) => setSort(s)}
          query={q}
          onSearch={(v) => {
            setQ(v || null)
            setPage(1)
          }}
        />

        {isLoading && items.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-muted)' }}>
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              padding: '64px 20px',
              textAlign: 'center',
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
            }}
          >
            No transcripts to show.
          </div>
        ) : filter.kind === 'trash' ? (
          items.map((t) => (
            <TrashRow
              key={t.id}
              t={t}
              onRestore={(id) => restoreMutation.mutate(id)}
              onDestroy={(x) => setToDestroy(x)}
            />
          ))
        ) : (
          items.map((t) => (
            <TranscriptRow
              key={t.id}
              t={t}
              query={q}
              onSelect={(id) => navigate(`/transcripts/${id}`)}
              onDelete={(x) => setToDelete(x)}
            />
          ))
        )}

        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPage={(n) => setPage(n)}
        />
      </div>

      {newOpen && <NewTranscriptDialog onClose={() => setNewOpen(false)} />}

      {toDelete && (
        <ConfirmDialog
          title="Move to trash?"
          message={
            <>
              <strong style={{ color: 'var(--fg)' }}>
                {toDelete.title || 'Unnamed transcript'}
              </strong>{' '}
              will be moved to the trash. You can restore it later from the trash view.
            </>
          }
          confirmLabel="Move to trash"
          danger
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}

      {toDestroy && (
        <ConfirmDialog
          title="Destroy permanently?"
          message={
            <>
              <strong style={{ color: 'var(--fg)' }}>
                {toDestroy.title || 'Unnamed transcript'}
              </strong>{' '}
              and all its associated files will be permanently deleted. This can't be undone.
            </>
          }
          confirmLabel="Destroy permanently"
          danger
          loading={destroyMutation.isPending}
          onConfirm={() => destroyMutation.mutate(toDestroy.id)}
          onClose={() => setToDestroy(null)}
        />
      )}
    </AppShell>
  )
}
