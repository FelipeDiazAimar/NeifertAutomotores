import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { guardarPlantillaDB, obtenerPlantilla } from '@/crm/services/presupuestoPlantilla.service'

const KEY = ['crm', 'presupuesto-plantilla']

const PUEDE_EDITAR_ROLES = ['admin', 'dueno']

/** Plantilla compartida de presupuestos.
 *  `{ plantilla, cargando, guardar: {mutate, isPending}, restablecer: {mutate, isPending}, puedeEditar }`.
 *  Solo admin y dueño pueden editar; el resto la usa de lectura. */
export function usePlantillaPresupuesto() {
  const qc = useQueryClient()
  const { rol } = useCrmPerfil()
  const puedeEditar = PUEDE_EDITAR_ROLES.includes(rol)

  const q = useQuery({ queryKey: KEY, queryFn: obtenerPlantilla, staleTime: 60_000 })

  const invalidar = () => qc.invalidateQueries({ queryKey: KEY })

  const guardar = useMutation({
    mutationFn: (plantilla) => guardarPlantillaDB(plantilla),
    onSuccess: () => {
      invalidar()
      toast.success('Plantilla guardada para todos.')
    },
    onError: (e) => toast.error(e.message ?? 'No se pudo guardar la plantilla.'),
  })

  return { plantilla: q.data ?? null, cargando: q.isLoading, error: q.error ?? null, guardar, puedeEditar }
}
