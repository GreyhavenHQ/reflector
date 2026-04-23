import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { extractDetail } from '@/lib/apiErrors'
import type { components } from '@/api/schema'

type Transcript = components['schemas']['GetTranscriptWithParticipants']
type Topic = components['schemas']['GetTranscriptTopic']
type Participant = components['schemas']['Participant']
type Waveform = components['schemas']['AudioWaveform']

const POLL_STATUSES = new Set(['processing', 'uploaded', 'recording'])

export const transcriptKey = (id: string) => ['transcript', id] as const
export const topicsKey = (id: string) => ['transcript', id, 'topics'] as const
export const waveformKey = (id: string) => ['transcript', id, 'waveform'] as const
export const participantsKey = (id: string) =>
  ['transcript', id, 'participants'] as const

export function useTranscript(id: string | undefined) {
  return useQuery<Transcript>({
    queryKey: id ? transcriptKey(id) : ['transcript', 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data, response, error } = await apiClient.GET(
        '/v1/transcripts/{transcript_id}',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to load transcript'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
      return data as Transcript
    },
    refetchInterval: (q) => {
      const status = (q.state.data as Transcript | undefined)?.status
      return status && POLL_STATUSES.has(status) ? 5_000 : false
    },
  })
}

export function useTranscriptTopics(id: string | undefined, enabled = true) {
  return useQuery<Topic[]>({
    queryKey: id ? topicsKey(id) : ['transcript', 'none', 'topics'],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, response } = await apiClient.GET(
        '/v1/transcripts/{transcript_id}/topics',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to load topics'), {
          status: response.status,
        })
      }
      return data as Topic[]
    },
  })
}

export function useTranscriptWaveform(id: string | undefined, enabled: boolean) {
  return useQuery<Waveform>({
    queryKey: id ? waveformKey(id) : ['transcript', 'none', 'waveform'],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, response } = await apiClient.GET(
        '/v1/transcripts/{transcript_id}/audio/waveform',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to load waveform'), {
          status: response.status,
        })
      }
      return data as Waveform
    },
    staleTime: 60_000,
  })
}

export function useTranscriptParticipants(id: string | undefined, enabled = true) {
  return useQuery<Participant[]>({
    queryKey: id ? participantsKey(id) : ['transcript', 'none', 'participants'],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, response } = await apiClient.GET(
        '/v1/transcripts/{transcript_id}/participants',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to load participants'), {
          status: response.status,
        })
      }
      return data as Participant[]
    },
  })
}

type UpdateBody = components['schemas']['UpdateTranscript']

export function useTranscriptMutations(id: string | undefined) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    if (!id) return
    queryClient.invalidateQueries({ queryKey: transcriptKey(id) })
  }

  const update = useMutation({
    mutationFn: async (patch: UpdateBody) => {
      const { data, response, error } = await apiClient.PATCH(
        '/v1/transcripts/{transcript_id}',
        {
          params: { path: { transcript_id: id! } },
          body: patch,
        },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Update failed'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
      return data
    },
    onSuccess: invalidate,
  })

  const softDelete = useMutation({
    mutationFn: async () => {
      const { response, error } = await apiClient.DELETE(
        '/v1/transcripts/{transcript_id}',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Delete failed'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts'] })
      invalidate()
    },
  })

  const restore = useMutation({
    mutationFn: async () => {
      const { response, error } = await apiClient.POST(
        '/v1/transcripts/{transcript_id}/restore',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Restore failed'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts'] })
      invalidate()
    },
  })

  const destroy = useMutation({
    mutationFn: async () => {
      const { response, error } = await apiClient.DELETE(
        '/v1/transcripts/{transcript_id}/destroy',
        { params: { path: { transcript_id: id! } } },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Destroy failed'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts'] })
    },
  })

  const sendEmail = useMutation({
    mutationFn: async (email: string) => {
      const { data, response, error } = await apiClient.POST(
        '/v1/transcripts/{transcript_id}/email',
        {
          params: { path: { transcript_id: id! } },
          body: { email } as never,
        },
      )
      if (!response.ok || !data) {
        throw Object.assign(new Error('Email failed'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
      return data
    },
  })

  const postToZulip = useMutation({
    mutationFn: async (args: {
      stream: string
      topic: string
      include_topics?: boolean
    }) => {
      const { response, error } = await apiClient.POST(
        '/v1/transcripts/{transcript_id}/zulip',
        {
          params: {
            path: { transcript_id: id! },
            query: {
              stream: args.stream,
              topic: args.topic,
              include_topics: args.include_topics ?? true,
            },
          },
        },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Zulip post failed'), {
          status: response.status,
          detail: extractDetail(error),
        })
      }
    },
  })

  return { update, softDelete, restore, destroy, sendEmail, postToZulip }
}
