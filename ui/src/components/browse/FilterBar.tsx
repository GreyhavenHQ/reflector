import { I } from '@/components/icons'
import type { RoomRowData, SidebarFilter, TagRowData } from '@/lib/types'
import { cn } from '@/lib/utils'

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
    <div className="flex items-center gap-3.5 px-5 py-2.5 border-b border-border bg-card font-sans text-xs">
      <span className="text-fg font-semibold">{label}</span>
      <span className="font-mono text-[11px] text-fg-muted">
        {total} {total === 1 ? 'result' : 'results'}
      </span>
      <div className="ml-3 inline-flex items-center gap-2 h-[30px] px-2.5 bg-bg border border-border rounded-md w-80 max-w-[40%]">
        <span className="text-fg-muted inline-flex">{I.Search(13)}</span>
        <input
          value={query || ''}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search transcripts, speakers, rooms…"
          className="border-none outline-none bg-transparent font-sans text-[12.5px] text-fg flex-1"
        />
        <span className="rf-kbd">⌘K</span>
      </div>
      <div className="flex-1" />
      <span className="text-fg-muted text-[11px] font-mono">sort</span>
      {(['newest', 'oldest', 'longest'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onSort(s)}
          className={cn(
            'border-none px-2 py-[3px] font-sans text-xs cursor-pointer rounded-sm',
            sort === s ? 'text-fg font-semibold bg-muted' : 'text-fg-muted font-medium bg-transparent',
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
