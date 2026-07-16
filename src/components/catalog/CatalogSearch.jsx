import { Search } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'

export default function CatalogSearch() {
  const search = useCatalogStore((s) => s.search)
  const setSearch = useCatalogStore((s) => s.setSearch)

  return (
    <div className="glass flex h-10 min-w-0 basis-full items-center gap-2 rounded-xl px-3 sm:basis-auto sm:flex-1 md:flex-none">
      <Search size={16} className="shrink-0 text-ink-3" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar modelo o año…"
        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 md:w-44"
      />
    </div>
  )
}
