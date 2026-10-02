import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/vehiculos.service'

export function useVehiculos(opts) {
  return useQuery({
    queryKey: ['crm', 'vehiculos', opts],
    queryFn: () => svc.listar(opts),
    keepPreviousData: true,
  })
}

export function useVehiculo(id) {
  return useQuery({
    queryKey: ['crm', 'vehiculo', id],
    queryFn: () => svc.obtener(id),
    enabled: Boolean(id),
  })
}

/** Recuento por estado para el encabezado de la lista. Se invalida junto
 *  con ['crm', 'vehiculos'] en cada mutación. */
export function useConteoVehiculos({ busqueda = '', filtros = {} } = {}) {
  return useQuery({
    queryKey: ['crm', 'vehiculos', 'conteo', { busqueda, filtros }],
    queryFn: () => svc.contarPorEstado({ busqueda, filtros }),
    keepPreviousData: true,
  })
}

export function useVehiculoMutations() {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'vehiculos'] })
    qc.invalidateQueries({ queryKey: ['crm', 'vehiculo'] })
  }

  const crear = useMutation({
    mutationFn: (data) => svc.crear(data, autorId),
    onSuccess: () => {
      invalidar()
      toast.success('Vehículo cargado.')
    },
    onError: (e) => toast.error(e.message),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, data }) => svc.actualizar(id, data, autorId),
    onSuccess: () => {
      invalidar()
      toast.success('Cambios guardados.')
    },
    onError: (e) => toast.error(e.message),
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ id, de, a }) => svc.cambiarEstado(id, de, a, autorId),
    onSuccess: () => invalidar(),
    onError: (e) => toast.error(e.message),
  })

  const eliminar = useMutation({
    mutationFn: (id) => svc.eliminar(id),
    onSuccess: () => {
      invalidar()
      toast.success('Vehículo eliminado.')
    },
    onError: (e) => toast.error(e.message.includes('permission') ? 'Solo un administrador puede eliminar.' : e.message),
  })

  return { crear, actualizar, cambiarEstado, eliminar }
}
