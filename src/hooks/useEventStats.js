import { useQuery } from '@tanstack/react-query'
import { fetchEventBreakdown } from '@/services/events.service'

/** Vistas/consultas/ventas reales (Supabase): totales + desglose por
 *  vehículo, acotado al rango de fechas del filtro. */
export function useEventStats({ from, to } = {}) {
  return useQuery({
    queryKey: ['eventos-breakdown', from, to],
    queryFn: () => fetchEventBreakdown({ from, to }),
  })
}
