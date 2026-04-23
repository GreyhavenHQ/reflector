export type TranscriptStatus = 'live' | 'ended' | 'processing' | 'uploading' | 'failed' | 'idle'

export type TranscriptSource = 'room' | 'upload' | 'live'

export type TranscriptRowData = {
  id: string
  title: string
  status: TranscriptStatus
  source: TranscriptSource
  room: string | null
  date: string
  duration: number
  speakers: number
  lang: string
  tags: string[]
  snippet: string | null
  progress?: number
  stage?: string
  eta?: string
  error?: string
  error_message?: string | null
}

export type TrashRowData = TranscriptRowData & {
  deleted_at: string
  days_remaining: number
}

export type RoomRowData = {
  id: string
  name: string
  shared: boolean
  /** Optional transcript count for sidebar display. `null` = render without a badge. */
  count: number | null
}

export type TagRowData = {
  id: string
  name: string
  count: number
}

export type SidebarFilter =
  | { kind: 'all'; value: null }
  | { kind: 'recent'; value: null }
  | { kind: 'source'; value: 'live' | 'file' }
  | { kind: 'room'; value: string }
  | { kind: 'tag'; value: string }
  | { kind: 'trash'; value: null }

export type RoomsFilter =
  | { kind: 'all'; value: null }
  | { kind: 'scope'; value: 'mine' | 'shared' }
  | { kind: 'status'; value: 'active' | 'calendar' }
  | { kind: 'platform'; value: 'whereby' | 'daily' | 'livekit' }
  | { kind: 'size'; value: 'normal' | 'group' }
  | { kind: 'recording'; value: 'cloud' | 'local' | 'none' }

export const LANG_LABELS: Record<string, string> = {
  en: 'EN',
  'en→es': 'EN→ES',
  'fr→en': 'FR→EN',
  'de→en': 'DE→EN',
  es: 'ES',
}

export const REFLECTOR_LANGS = [
  { code: 'auto', name: 'Auto-detect', flag: '🌐' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', name: 'Mandarin', flag: '🇨🇳' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
] as const
