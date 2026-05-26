import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { apiClient } from '@/api/client'

export type RoomDetails = components['schemas']['RoomDetails']
export type Meeting = components['schemas']['Meeting']
export type CalendarEventResponse = components['schemas']['CalendarEventResponse']

const ROOM_KEY = (name: string) => ['room', 'byName', name] as const
const MEETING_KEY = (room: string, id: string) =>
  ['room', 'meeting', room, id] as const
const ACTIVE_KEY = (room: string) => ['room', 'meetings', 'active', room] as const
const UPCOMING_KEY = (room: string) =>
  ['room', 'meetings', 'upcoming', room] as const

export function useRoomByName(name: string | null) {
  return useQuery<RoomDetails>({
    queryKey: ROOM_KEY(name ?? ''),
    enabled: !!name,
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/rooms/name/{room_name}', {
        params: { path: { room_name: name! } },
      })
      if (!response.ok || !data) {
        throw Object.assign(new Error('Room not found'), {
          status: response.status,
        })
      }
      return data
    },
    staleTime: 30_000,
  })
}

export function useRoomMeeting(roomName: string | null, meetingId: string | null) {
  return useQuery<Meeting>({
    queryKey: MEETING_KEY(roomName ?? '', meetingId ?? ''),
    enabled: !!roomName && !!meetingId,
    queryFn: async () => {
      const { data, response } = await apiClient.GET(
        '/v1/rooms/{room_name}/meetings/{meeting_id}',
        {
          params: { path: { room_name: roomName!, meeting_id: meetingId! } },
        },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Meeting not found'), {
          status: response.status,
        })
      }
      return data
    },
    staleTime: 15_000,
  })
}

export function useRoomActiveMeetings(roomName: string | null, enabled = true) {
  return useQuery<Meeting[]>({
    queryKey: ACTIVE_KEY(roomName ?? ''),
    enabled: !!roomName && enabled,
    queryFn: async () => {
      const { data, response } = await apiClient.GET(
        '/v1/rooms/{room_name}/meetings/active',
        { params: { path: { room_name: roomName! } } },
      )
      if (!response.ok || !data) return []
      return data
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useRoomUpcomingMeetings(
  roomName: string | null,
  enabled = true,
  minutesAhead = 120,
) {
  return useQuery<CalendarEventResponse[]>({
    queryKey: [...UPCOMING_KEY(roomName ?? ''), minutesAhead],
    enabled: !!roomName && enabled,
    queryFn: async () => {
      const { data, response } = await apiClient.GET(
        '/v1/rooms/{room_name}/meetings/upcoming',
        {
          params: {
            path: { room_name: roomName! },
            query: { minutes_ahead: minutesAhead },
          },
        },
      )
      if (!response.ok || !data) return []
      return data
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

export function useRoomCreateMeeting() {
  const queryClient = useQueryClient()
  return useMutation<
    Meeting,
    Error,
    { roomName: string; allowDuplicated?: boolean }
  >({
    mutationFn: async ({ roomName, allowDuplicated = false }) => {
      const { data, response } = await apiClient.POST(
        // Backend exposes the create path as `.../meeting` (singular) even
        // though the list path is `.../meetings` — matches the FastAPI
        // router in server/reflector/views/rooms.py.
        '/v1/rooms/{room_name}/meeting',
        {
          params: { path: { room_name: roomName } },
          body: { allow_duplicated: allowDuplicated },
        },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to create meeting'), {
          status: response.status,
        })
      }
      return data
    },
    onSuccess: (_meeting, vars) => {
      queryClient.invalidateQueries({ queryKey: ACTIVE_KEY(vars.roomName) })
    },
  })
}

export function useRoomJoinMeeting() {
  return useMutation<
    Meeting,
    Error,
    { roomName: string; meetingId: string; displayName?: string }
  >({
    mutationFn: async ({ roomName, meetingId, displayName }) => {
      const { data, response } = await apiClient.POST(
        '/v1/rooms/{room_name}/meetings/{meeting_id}/join',
        {
          params: {
            path: { room_name: roomName, meeting_id: meetingId },
            query: displayName ? { display_name: displayName } : {},
          },
        },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to join meeting'), {
          status: response.status,
        })
      }
      return data
    },
  })
}

/**
 * For non-ICS rooms: pick the first active meeting if any, otherwise create
 * one. Mirrors www's useRoomDefaultMeeting flow so the user lands directly
 * in a video room when no scheduling is involved.
 */
export function useRoomDefaultMeeting(roomName: string | null, enabled: boolean) {
  const active = useRoomActiveMeetings(roomName, enabled)
  const create = useRoomCreateMeeting()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!enabled || !roomName) return
    if (meeting) return
    if (active.isLoading) return

    const first = (active.data ?? [])[0]
    if (first) {
      setMeeting(first)
      return
    }
    if (creating || create.isPending) return

    setCreating(true)
    create
      .mutateAsync({ roomName, allowDuplicated: false })
      .then((m) => setMeeting(m))
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setCreating(false))
  }, [
    enabled,
    roomName,
    active.data,
    active.isLoading,
    creating,
    create,
    meeting,
  ])

  return {
    meeting,
    loading: active.isLoading || creating || create.isPending,
    error: error || (active.error as Error | null),
  }
}
