import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

function pageRange(page, totalPages, windowSize = 2) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

  const start = Math.max(2, page - windowSize)
  const end = Math.min(totalPages - 1, page + windowSize)
  const pages = [1]

  if (start > 2) pages.push('…')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < totalPages - 1) pages.push('…')
  pages.push(totalPages)

  return pages
}

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  const pages = pageRange(page, totalPages)

  return (
    <div className="mt-6 flex items-center justify-center gap-1 overflow-x-auto sm:gap-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="grid h-9 w-7 place-items-center text-xs text-ink-3">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              'grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2.5 text-sm font-semibold transition-colors',
              p === page
                ? 'bg-neifert text-white shadow-glow-red'
                : 'text-ink-2 hover:text-neifert'
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Página siguiente"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
