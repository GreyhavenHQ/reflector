import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'

type Props = {
  page: number
  total: number
  pageSize: number
  onPage: (n: number) => void
}

export function Pagination({ page, total, pageSize, onPage }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--card)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
        {start}–{end} of {total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          {I.ChevronLeft(14)}
        </Button>
        {pages.map((n) => (
          <button
            key={n}
            onClick={() => onPage(n)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              border: '1px solid',
              borderColor: n === page ? 'var(--primary)' : 'var(--border)',
              background: n === page ? 'var(--primary)' : 'var(--card)',
              color: n === page ? 'var(--primary-fg)' : 'var(--fg)',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {n}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={page === totalPages}
          onClick={() => onPage(page + 1)}
        >
          {I.ChevronRight(14)}
        </Button>
      </div>
    </div>
  )
}
