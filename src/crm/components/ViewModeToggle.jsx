import { List, LayoutGrid } from 'lucide-react'
import { useViewModeStore } from '@/crm/store/useViewModeStore'
import { cn } from '@/lib/cn'

/** Mini toggle lista/tarjetas, para ubicar a la izquierda del botón de
 *  Filtros en las listas del CRM. La elección se comparte entre Vehículos,
 *  Peritaje y Gestoría y persiste entre sesiones. */
export default function ViewModeToggle({ className }) {
  const viewMode = useViewModeStore((s) => s.viewMode)
  const setViewMode = useViewModeStore((s) => s.setViewMode)

  return (
    <div className={cn('glass flex h-10 shrink-0 items-center gap-1 rounded-2xl p-1', className)}>
      <button
        type="button"
        onClick={() => setViewMode('list')}
        aria-pressed={viewMode === 'list'}
        aria-label="Ver como lista"
        title="Ver como lista"
        className={cn(
          'grid h-8 w-8 place-items-center rounded-xl transition-colors',
          viewMode === 'list' ? 'bg-neifert text-white' : 'text-ink-3 hover:text-ink',
        )}
      >
        <List size={15} />
      </button>
      <button
        type="button"
        onClick={() => setViewMode('card')}
        aria-pressed={viewMode === 'card'}
        aria-label="Ver como tarjetas"
        title="Ver como tarjetas"
        className={cn(
          'grid h-8 w-8 place-items-center rounded-xl transition-colors',
          viewMode === 'card' ? 'bg-neifert text-white' : 'text-ink-3 hover:text-ink',
        )}
      >
        <LayoutGrid size={15} />
      </button>
    </div>
  )
}
