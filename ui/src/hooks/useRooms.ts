import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { RoomRowData } from '@/lib/types'

type ServerRoom = {
  id: string
  name: string
  is_shared?: boolean
  shared?: boolean
  transcripts_count?: number | null
  count?: number | null
}

function normalize(r: ServerRoom): RoomRowData {
  const rawCount = r.transcripts_count ?? r.count
  return {
    id: r.id,
    name: r.name,
    shared: r.is_shared ?? r.shared ?? false,
    // Backend doesn't expose a per-room transcript count today, so leave it
    // null unless the response happens to include one — consumers render
    // `null` as "no badge".
    count: typeof rawCount === 'number' ? rawCount : null,
  }
}

export function useRooms() {
  return useQuery<RoomRowData[]>({
    queryKey: ['rooms'],
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/rooms', {
        params: { query: { page: 1, size: 100 } as never },
      })
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to load rooms'), { status: response.status })
      }
      const page = data as { items?: ServerRoom[] }
      return (page.items ?? []).map(normalize)
    },
    staleTime: 60_000,
  })
}
