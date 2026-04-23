import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PASSWORD_TOKEN_KEY } from '@/api/client'
import type { components } from '@/api/schema'
import {
  participantsKey,
  topicsKey,
  transcriptKey,
  waveformKey,
} from './useTranscript'

type Transcript = components['schemas']['GetTranscriptWithParticipants']
type Topic = components['schemas']['GetTranscriptTopic']

const MAX_RETRIES = 10

function getReconnectDelayMs(retryIndex: number) {
  return Math.min(1000 * Math.pow(2, retryIndex), 30_000)
}

function getToken(): string | null {
  try {
    const stored = sessionStorage.getItem(PASSWORD_TOKEN_KEY)
    if (stored) return stored
  } catch {
    // ignore
  }
  // OIDC store keys look like oidc.user:<authority>:<client_id>
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k || !k.startsWith('oidc.user:')) continue
      const raw = sessionStorage.getItem(k)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as { access_token?: string }
        if (parsed?.access_token) return parsed.access_token
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return null
}

type LiveHandler = (text: string, translation: string) => void

type Options = {
  onLiveText?: LiveHandler
}

export function useTranscriptWs(id: string | undefined, opts: Options = {}) {
  const queryClient = useQueryClient()
  const socketRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const aliveRef = useRef(true)
  const onLiveRef = useRef(opts.onLiveText)

  useEffect(() => {
    onLiveRef.current = opts.onLiveText
  }, [opts.onLiveText])

  useEffect(() => {
    if (!id) return
    aliveRef.current = true

    const connect = () => {
      if (!aliveRef.current) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${window.location.host}/v1/transcripts/${id}/events`
      const token = getToken()
      const subprotocols: string[] = ['bearer']
      if (token) subprotocols.push(token)
      let ws: WebSocket
      try {
        ws = new WebSocket(url, subprotocols)
      } catch (err) {
        console.error('WS construct failed', err)
        return
      }
      socketRef.current = ws

      ws.onopen = () => {
        retryRef.current = 0
      }

      ws.onmessage = (ev) => {
        let msg: { event?: string; data?: unknown }
        try {
          msg = JSON.parse(ev.data as string)
        } catch {
          return
        }
        if (!msg?.event) return
        dispatch(msg as { event: string; data: unknown })
      }

      ws.onerror = () => {
        // error handled by onclose retry
      }

      ws.onclose = () => {
        socketRef.current = null
        if (!aliveRef.current) return
        if (retryRef.current >= MAX_RETRIES) return
        const delay = getReconnectDelayMs(retryRef.current)
        retryRef.current += 1
        setTimeout(connect, delay)
      }
    }

    const dispatch = ({ event, data }: { event: string; data: unknown }) => {
      switch (event) {
        case 'STATUS': {
          const next = (data as { value?: Transcript['status'] })?.value
          if (next) {
            queryClient.setQueryData<Transcript | undefined>(
              transcriptKey(id),
              (prev) => (prev ? { ...prev, status: next } : prev),
            )
            queryClient.invalidateQueries({ queryKey: transcriptKey(id) })
            if (next === 'ended' || next === 'error') {
              queryClient.invalidateQueries({ queryKey: topicsKey(id) })
              queryClient.invalidateQueries({ queryKey: waveformKey(id) })
              queryClient.invalidateQueries({ queryKey: participantsKey(id) })
            }
          }
          return
        }
        case 'FINAL_TITLE': {
          const title = (data as { title?: string })?.title
          if (typeof title !== 'string') return
          // Skip replay on terminal transcripts — the GET response is the
          // source of truth (includes user edits). Only apply during the
          // processing → ended transition.
          const current = queryClient.getQueryData<Transcript>(transcriptKey(id))
          const status = current?.status
          if (status === 'ended' || status === 'error') return
          queryClient.setQueryData<Transcript | undefined>(
            transcriptKey(id),
            (prev) => (prev ? { ...prev, title } : prev),
          )
          return
        }
        case 'FINAL_LONG_SUMMARY': {
          const long_summary = (data as { long_summary?: string })?.long_summary
          if (typeof long_summary !== 'string') return
          const current = queryClient.getQueryData<Transcript>(transcriptKey(id))
          const status = current?.status
          if (status === 'ended' || status === 'error') return
          queryClient.setQueryData<Transcript | undefined>(
            transcriptKey(id),
            (prev) => (prev ? { ...prev, long_summary } : prev),
          )
          return
        }
        case 'DURATION': {
          const duration = (data as { duration?: number })?.duration
          if (typeof duration === 'number') {
            queryClient.setQueryData<Transcript | undefined>(
              transcriptKey(id),
              (prev) => (prev ? { ...prev, duration } : prev),
            )
          }
          return
        }
        case 'WAVEFORM': {
          const waveform = (data as { waveform?: number[] })?.waveform
          if (Array.isArray(waveform)) {
            queryClient.setQueryData(waveformKey(id), { data: waveform })
          }
          return
        }
        case 'TOPIC': {
          const topic = data as Topic
          queryClient.setQueryData<Topic[] | undefined>(
            topicsKey(id),
            (prev) => {
              if (!prev) return [topic]
              const existing = prev.findIndex((x) => x.id === topic.id)
              if (existing >= 0) {
                const next = prev.slice()
                next[existing] = topic
                return next
              }
              return [...prev, topic]
            },
          )
          // Ensure we reconcile with server ordering (the backend replays
          // stored TOPIC events on WS connect — dedupe alone isn't enough
          // if the server emits refined titles later).
          queryClient.invalidateQueries({ queryKey: topicsKey(id) })
          return
        }
        case 'TRANSCRIPT': {
          const text = (data as { text?: string })?.text ?? ''
          const translation = (data as { translation?: string })?.translation ?? ''
          onLiveRef.current?.(text, translation)
          return
        }
        default:
          return
      }
    }

    connect()

    return () => {
      aliveRef.current = false
      const ws = socketRef.current
      socketRef.current = null
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [id, queryClient])
}
