import { useQuery } from '@tanstack/react-query'
import { cargarDemandas } from '@/crm/services/compradores.service'

/** Líneas de interés de clientes y leads (se cruzan en el navegador). */
export function useDemandas() {
  return useQuery({
    queryKey: ['crm', 'compradores', 'demandas'],
    queryFn: cargarDemandas,
    staleTime: 30_000,
  })
}
