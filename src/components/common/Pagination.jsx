import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className="grid h-9 w-9 place-items-center rounded-full glass text-ink-2 transition-colors hover:text-neifert disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'grid h-9 min-w-9 place-items-center rounded-full px-3 text-sm font-semibold transition-colors',
            p === page ? 'bg-neifert text-white shadow-glow-red' : 'glass text-ink-2 hover:text-neifert'
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Página siguiente"
        className="grid h-9 w-9 place-items-center rounded-full glass text-ink-2 transition-colors hover:text-neifert disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
