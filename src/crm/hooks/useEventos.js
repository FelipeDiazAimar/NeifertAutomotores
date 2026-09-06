import { useQuery } from '@tanstack/react-query'
import { listarDeEntidad } from '@/crm/services/eventos.service'

/** Eventos de una entidad ('vehiculo' | 'cliente'). */
export function useEventos(entidad, id) {
  return useQuery({
    queryKey: ['crm', 'eventos', entidad, id],
    queryFn: () => listarDeEntidad(entidad, id),
    enabled: Boolean(id),
  })
}
