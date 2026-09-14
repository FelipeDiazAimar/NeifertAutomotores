import { useQuery } from '@tanstack/react-query'
import { useCatalogStore } from '@/store/useCatalogStore'
import { listarPublicos, listarTodos, obtenerPublicoPorId } from '@/crm/services/vehiculosPublico.service'

/** Lista pública de vehículos derivada de los filtros del catálogo (Zustand). */
export function useVehicles() {
  const category = useCatalogStore((s) => s.category)
  const sort = useCatalogStore((s) => s.sort)
  const search = useCatalogStore((s) => s.search)
  const filters = useCatalogStore((s) => s.filters)

  return useQuery({
    queryKey: ['vehicles', { category, sort, search, filters }],
    queryFn: () => listarPublicos({ category, sort, search, filters }),
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
