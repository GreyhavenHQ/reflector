import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { apiClient } from '@/api/client'

export type ApiKey = components['schemas']['ApiKeyResponse']
export type ApiKeyWithSecret = components['schemas']['CreateApiKeyResponse']

const KEY = ['apiKeys'] as const

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, response } = await apiClient.GET('/v1/user/api-keys')
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to load API keys'), {
          status: response.status,
        })
      }
      return data
    },
    staleTime: 60_000,
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation<ApiKeyWithSecret, Error, { name?: string | null }>({
    mutationFn: async ({ name }) => {
      const { data, response } = await apiClient.POST('/v1/user/api-keys', {
        body: { name: name?.trim() || null },
      })
      if (!response.ok || !data) {
        throw Object.assign(new Error('Failed to create API key'), {
          status: response.status,
        })
      }
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (keyId) => {
      const { response } = await apiClient.DELETE(
        '/v1/user/api-keys/{key_id}',
        { params: { path: { key_id: keyId } } },
      )
      if (!response.ok) {
        throw Object.assign(new Error('Failed to delete API key'), {
          status: response.status,
        })
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
