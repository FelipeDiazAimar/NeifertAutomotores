import { useCatalogStore } from '@/store/useCatalogStore'
import { useSiteStore } from '@/store/useSiteStore'
import { cn } from '@/lib/cn'

export default function CategoryFilter() {
  const category = useCatalogStore((s) => s.category)
  const setCategory = useCatalogStore((s) => s.setCategory)
  const categories = useSiteStore((s) => s.categories)
  const items = [{ id: 'todos', label: 'Todos' }, ...categories]

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {items.map((c) => (
        <button
          key={c.id}
          onClick={() => setCategory(c.id)}
          className={cn(
            'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all',
            category === c.id
              ? 'bg-neifert text-white shadow-glow-red'
              : 'glass text-ink-2 hover:text-ink'
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
