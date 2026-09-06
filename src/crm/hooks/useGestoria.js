import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/gestoria.service'

export function useGestoria(vehiculoId) {
  return useQuery({
    queryKey: ['crm', 'gestoria', vehiculoId],
    queryFn: () => svc.obtenerPorVehiculo(vehiculoId),
    enabled: Boolean(vehiculoId),
  })
}

export function useGestoriasTodas(opts = {}) {
  return useQuery({
    queryKey: ['crm', 'gestoria', 'todas', opts],
    queryFn: () => svc.listarTodas(opts),
  })
}

export function useGestoriaMutations(vehiculoId) {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()

  const guardarCampos = useMutation({
    mutationFn: (parche) => svc.guardarCampos(vehiculoId, parche, autorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'gestoria', vehiculoId] })
      qc.invalidateQueries({ queryKey: ['crm', 'eventos', 'vehiculo', vehiculoId] })
      qc.invalidateQueries({ queryKey: ['crm', 'vehiculos'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return { guardarCampos }
}
