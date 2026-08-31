import { useQuery } from '@tanstack/react-query'
import { listarDeVehiculo } from '@/crm/services/eventos.service'

export function useEventosVehiculo(vehiculoId) {
  return useQuery({
    queryKey: ['crm', 'eventos', vehiculoId],
    queryFn: () => listarDeVehiculo(vehiculoId),
    enabled: Boolean(vehiculoId),
  })
}
