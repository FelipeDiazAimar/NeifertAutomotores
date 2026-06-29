import { LayoutGrid, List } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'
import { cn } from '@/lib/cn'

export default function ViewToggle() {
  const view = useCatalogStore((s) => s.viewMode)
  const setView = useCatalogStore((s) => s.setViewMode)

  return (
    <div className="glass hidden items-center gap-1 rounded-xl p-1 sm:flex">
      {[
        ['grid', LayoutGrid],
        ['list', List],
      ].map(([mode, Icon]) => (
        <button
          key={mode}
          onClick={() => setView(mode)}
          aria-label={`Vista ${mode}`}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg transition-colors',
            view === mode ? 'bg-neifert text-white' : 'text-ink-3 hover:text-ink'
          )}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
