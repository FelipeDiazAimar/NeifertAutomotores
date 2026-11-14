import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/crm/services/vehiculos.service'

/** Vehículos visibles en el catálogo de usados o de 0 km, con su posición de
 *  relevancia. Cuelga de ['crm','vehiculos'] para refrescarse con los cambios
 *  de vehículos (y con el realtime de la tabla). */
export function useVehiculosRelevancia(cero) {
  return useQuery({
    queryKey: ['crm', 'vehiculos', 'relevancia', cero ? 'cero' : 'usados'],
    queryFn: () => svc.listarParaRelevancia({ cero }),
  })
}

export function useGuardarRelevancias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cambios) => svc.guardarRelevancias(cambios),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'vehiculos'] })
      // Los catálogos públicos ordenan por relevancia.
      qc.invalidateQueries({ queryKey: ['vehicles'] })
    },
    onError: (e) =>
      toast.error(
        e?.message?.includes('permission')
          ? 'No tenés permiso para cambiar la relevancia.'
          : `No se pudo guardar el orden: ${e?.message ?? e}`,
      ),
  })
}
