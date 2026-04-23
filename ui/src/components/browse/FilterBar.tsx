import { I } from '@/components/icons'
import type { RoomRowData, SidebarFilter, TagRowData } from '@/lib/types'

type SortKey = 'newest' | 'oldest' | 'longest'

type FilterBarProps = {
  filter: SidebarFilter
  rooms: RoomRowData[]
  tags: TagRowData[]
  total: number
  sort: SortKey
  onSort: (s: SortKey) => void
  query: string
  onSearch: (v: string) => void
}

export function FilterBar({
  filter,
  rooms,
  tags,
  total,
  sort,
  onSort,
  query,
  onSearch,
}: FilterBarProps) {
  let label = 'All transcripts'
  if (filter.kind === 'source' && filter.value === 'live') label = 'Live transcripts'
  if (filter.kind === 'source' && filter.value === 'file') label = 'Uploaded files'
  if (filter.kind === 'room') {
    const r = rooms.find((x) => x.id === filter.value)
    label = r ? `Room · ${r.name}` : 'Room'
  }
  if (filter.kind === 'tag') {
    const t = tags.find((x) => x.id === filter.value)
    label = t ? `Tagged · #${t.name}` : 'Tag'
  }
  if (filter.kind === 'trash') label = 'Trash'
  if (filter.kind === 'recent') label = 'Recent (last 7 days)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--fg-muted)',
        }}
      >
        {total} {total === 1 ? 'result' : 'results'}
      </span>
      <div
        style={{
          marginLeft: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 30,
          padding: '0 10px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          width: 320,
          maxWidth: '40%',
        }}
      >
        <span style={{ color: 'var(--fg-muted)', display: 'inline-flex' }}>{I.Search(13)}</span>
        <input
          value={query || ''}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search transcripts, speakers, rooms…"
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: 'var(--fg)',
            flex: 1,
          }}
        />
        <span className="rf-kbd">⌘K</span>
      </div>
      <div style={{ flex: 1 }} />
      <span
        style={{
          color: 'var(--fg-muted)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
        }}
      >
        sort
      </span>
      {(['newest', 'oldest', 'longest'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onSort(s)}
          style={{
            border: 'none',
            padding: '3px 8px',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            cursor: 'pointer',
            color: sort === s ? 'var(--fg)' : 'var(--fg-muted)',
            fontWeight: sort === s ? 600 : 500,
            borderRadius: 'var(--radius-sm)',
            background: sort === s ? 'var(--muted)' : 'transparent',
          }}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
