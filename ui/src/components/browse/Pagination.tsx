import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

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
    <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-card font-sans text-xs">
      <span className="text-fg-muted font-mono">
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
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
            className={cn(
              'w-[30px] h-[30px] rounded-md cursor-pointer border font-sans text-xs font-medium',
              n === page
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-border bg-card text-fg',
            )}
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
