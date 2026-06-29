import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCatalogStore } from '@/store/useCatalogStore'
import {
  fetchVehicles,
  fetchAllVehicles,
  fetchVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from '@/services/vehicles.service'

/** Lista pública de vehículos derivada de los filtros del catálogo (Zustand). */
export function useVehicles() {
  const category = useCatalogStore((s) => s.category)
  const sort = useCatalogStore((s) => s.sort)
  const search = useCatalogStore((s) => s.search)
  const filters = useCatalogStore((s) => s.filters)

  return useQuery({
    queryKey: ['vehicles', { category, sort, search, filters }],
    queryFn: () => fetchVehicles({ category, sort, search, filters }),
  })
}

/** Todos los vehículos (panel admin), sin filtrar por estado. */
export function useAllVehicles() {
  return useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: fetchAllVehicles,
  })
}

export function useVehicle(id) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => fetchVehicleById(id),
    enabled: Boolean(id),
  })
}

/** Mutaciones del catálogo (crear/editar/borrar) para el panel admin. */
export function useVehicleMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicles'] })

  const create = useMutation({ mutationFn: createVehicle, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, patch }) => updateVehicle(id, patch),
    onSuccess: (_d, vars) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['vehicle', vars.id] })
    },
  })
  const remove = useMutation({ mutationFn: deleteVehicle, onSuccess: invalidate })

  return { create, update, remove }
}
