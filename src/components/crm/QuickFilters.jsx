import { useCrmStore } from '@/store/useCrmStore'
import { useLeadCounts } from '@/hooks/useLeads'
import { cn } from '@/lib/cn'

const FILTERS = [
  ['todos', 'Todos los Leads'],
  ['nuevos', 'Nuevos'],
  ['seguimiento', 'En Seguimiento'],
  ['finalizados', 'Finalizados'],
]

export default function QuickFilters() {
  const quickFilter = useCrmStore((s) => s.quickFilter)
  const setQuickFilter = useCrmStore((s) => s.setQuickFilter)
  const { data: counts } = useLeadCounts()

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {FILTERS.map(([id, label]) => {
        const active = quickFilter === id
        return (
          <button
            key={id}
            onClick={() => setQuickFilter(id)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all',
              active ? 'bg-neifert text-white shadow-glow-red' : 'glass text-ink-2 hover:text-ink'
            )}
          >
            {label}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs font-semibold',
                active ? 'bg-white/20' : 'bg-ink/10 text-ink-2'
              )}
            >
              {counts?.[id] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}
