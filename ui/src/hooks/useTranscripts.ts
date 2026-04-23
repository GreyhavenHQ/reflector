import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components, paths } from '@/api/schema'
import type { TranscriptRowData, TranscriptSource, TranscriptStatus } from '@/lib/types'

type ApiStatus = components['schemas']['SearchResult']['status']

const STATUS_TO_ROW: Record<ApiStatus, TranscriptStatus> = {
  idle: 'idle',
  uploaded: 'uploading',
  recording: 'live',
  processing: 'processing',
  error: 'failed',
  ended: 'ended',
}

type SourceKind = components['schemas']['SourceKind']

function mapSource(kind: SourceKind): TranscriptSource {
  if (kind === 'file') return 'upload'
  return kind
}

function composeLang(src?: string | null, tgt?: string | null): string {
  if (src && tgt && src !== tgt) return `${src}→${tgt}`
  return src ?? ''
}

function snippetOf(snippets?: string[] | null): string | null {
  if (!snippets || snippets.length === 0) return null
  return snippets[0] ?? null
}

// Backend stores duration in milliseconds (see server/.../file_pipeline.py: `{"duration": duration_ms}`),
// despite SearchResult's schema description saying "seconds". Normalize to whole seconds here.
function toSeconds(ms: number | null | undefined): number {
  if (!ms) return 0
  return Math.round(ms / 1000)
}

function normalizeSearchResult(r: components['schemas']['SearchResult']): TranscriptRowData {
  return {
    id: r.id,
    title: r.title ?? '',
    status: STATUS_TO_ROW[r.status],
    source: mapSource(r.source_kind),
    room: r.room_name ?? null,
    date: r.created_at,
    duration: toSeconds(r.duration),
    speakers: r.speaker_count ?? 0,
    lang: '',
    tags: [],
    snippet: snippetOf(r.search_snippets),
    error_message: null,
  }
}

function normalizeListItem(r: components['schemas']['GetTranscriptMinimal']): TranscriptRowData {
  return {
    id: r.id,
    title: r.title ?? r.name ?? '',
    status: STATUS_TO_ROW[r.status],
    source: mapSource(r.source_kind),
    room: r.room_name ?? null,
    date: r.created_at,
    duration: toSeconds(r.duration),
    speakers: r.speaker_count ?? 0,
    lang: composeLang(r.source_language, r.target_language),
    tags: [],
    snippet: null,
    error_message: null,
  }
}

type SearchParams = NonNullable<paths['/v1/transcripts/search']['get']['parameters']['query']>
type ListParams = NonNullable<paths['/v1/transcripts']['get']['parameters']['query']>

export type TranscriptListResult = {
  items: TranscriptRowData[]
  total: number
}

export type TranscriptSort = 'newest' | 'oldest' | 'longest'

type UseTranscriptsArgs = {
  query: string
  page: number
  pageSize: number
  sourceKind?: 'live' | 'file' | 'room'
  roomId?: string | null
  includeDeleted?: boolean
  /** Keep only transcripts whose created_at is within this many days. */
  sinceDays?: number | null
  sort?: TranscriptSort
}

function sortItems(items: TranscriptRowData[], sort: TranscriptSort): TranscriptRowData[] {
  const out = [...items]
  if (sort === 'oldest') out.sort((a, b) => a.date.localeCompare(b.date))
  else if (sort === 'longest') out.sort((a, b) => b.duration - a.duration)
  else out.sort((a, b) => b.date.localeCompare(a.date))
  return out
}

export function useTranscripts({
  query,
  page,
  pageSize,
  sourceKind,
  roomId,
  includeDeleted,
  sinceDays,
  sort = 'newest',
}: UseTranscriptsArgs) {
  const q = query.trim()
  const sinceIso =
    sinceDays && sinceDays > 0
      ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
      : null

  const useSearchEndpoint = q.length > 0 || !!includeDeleted

  return useQuery<TranscriptListResult>({
    queryKey: [
      'transcripts',
      { q, page, pageSize, sourceKind, roomId, includeDeleted, sinceIso, sort },
    ],
    queryFn: async () => {
      if (useSearchEndpoint) {
        const params: SearchParams = {
          q,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }
        if (sourceKind) params.source_kind = sourceKind
        if (roomId) params.room_id = roomId
        if (includeDeleted) params.include_deleted = true
        if (sinceIso) params.from = sinceIso
        const { data, response } = await apiClient.GET('/v1/transcripts/search', {
          params: { query: params },
        })
        if (!response.ok || !data) {
          throw Object.assign(new Error('Search failed'), { status: response.status })
        }
        return {
          items: sortItems(data.results.map(normalizeSearchResult), sort),
          total: data.total,
        }
      }
      const params: ListParams = {
        page,
        size: pageSize,
        sort_by: 'created_at',
      }
      if (sourceKind) params.source_kind = sourceKind
      if (roomId) params.room_id = roomId
      const { data, response } = await apiClient.GET('/v1/transcripts', {
        params: { query: params },
      })
      if (!response.ok || !data) {
        throw Object.assign(new Error('List failed'), { status: response.status })
      }
      const allItems = data.items.map(normalizeListItem)
      const filtered = sinceIso
        ? allItems.filter((t) => t.date >= sinceIso)
        : allItems
      return {
        items: sortItems(filtered, sort),
        total: sinceIso ? filtered.length : (data.total ?? allItems.length),
      }
    },
    placeholderData: (prev) => prev,
  })
}
