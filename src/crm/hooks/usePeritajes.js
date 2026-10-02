import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/crm/services/peritajes.service'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'

export function usePeritajes(vehiculoId) {
  return useQuery({
    queryKey: ['crm', 'peritajes', vehiculoId],
    queryFn: () => svc.listarPorVehiculo(vehiculoId),
    enabled: Boolean(vehiculoId),
  })
}

export function usePeritajesVehiculos(opts = {}) {
  return useQuery({
    queryKey: ['crm', 'peritajes', 'vehiculos', opts],
    queryFn: () => svc.listarVehiculos(opts),
  })
}

export function usePeritaje(id) {
  return useQuery({
    queryKey: ['crm', 'peritaje', id],
    queryFn: () => svc.obtener(id),
    enabled: Boolean(id),
  })
}

export function usePeritajeMutations(vehiculoId) {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'peritajes', vehiculoId] })
    qc.invalidateQueries({ queryKey: ['crm', 'peritajes', 'vehiculos'] })
    qc.invalidateQueries({ queryKey: ['crm', 'eventos', 'vehiculo', vehiculoId] })
  }

  const crear = useMutation({
    mutationFn: (data) => svc.crear({ ...data, vehiculoId }),
    onSuccess: () => {
      invalidar()
      toast.success('Peritaje guardado.')
    },
    onError: (e) => toast.error(e.message),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, data }) => svc.actualizar(id, { ...data, vehiculoId }),
    onSuccess: () => {
      invalidar()
      toast.success('Peritaje actualizado.')
    },
    onError: (e) => toast.error(e.message),
  })

  const eliminar = useMutation({
    mutationFn: (id) => svc.eliminar(id, vehiculoId, autorId),
    onSuccess: () => {
      invalidar()
      toast.success('Peritaje eliminado.')
    },
    onError: (e) => toast.error(e.message),
  })

  return { crear, actualizar, eliminar }
}
