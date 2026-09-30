import { useQuery } from '@tanstack/react-query'
import { useCatalogStore } from '@/store/useCatalogStore'
import { listarPublicos, listarTodos, obtenerPublicoPorId } from '@/crm/services/vehiculosPublico.service'

/** Lista pública de vehículos derivada de los filtros del catálogo (Zustand).
 *  `condition`: 'todos' | 'usados' | 'cero' — la pasa la página (Catálogo
 *  Usados vs Catálogo 0km). */
export function useVehicles(condition = 'todos') {
  const category = useCatalogStore((s) => s.category)
  const sort = useCatalogStore((s) => s.sort)
  const search = useCatalogStore((s) => s.search)
  const filters = useCatalogStore((s) => s.filters)

  return useQuery({
    queryKey: ['vehicles', { category, sort, search, filters, condition }],
    queryFn: () => listarPublicos({ category, sort, search, filters, condition }),
  })
}

/** Todos los vehículos (panel admin/estadísticas), sin filtrar por estado. */
export function useAllVehicles() {
  return useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: listarTodos,
  })
}

export function useVehicle(id) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => obtenerPublicoPorId(id),
    enabled: Boolean(id),
  })
}
