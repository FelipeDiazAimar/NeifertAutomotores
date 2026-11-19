import { useQuery } from '@tanstack/react-query'
import { cargarDemandas, cargarOfertas } from '@/crm/services/compradores.service'

/** Líneas de interés de clientes y leads (se cruzan en el navegador). */
export function useDemandas(opciones = {}) {
  return useQuery({
    queryKey: ['crm', 'compradores', 'demandas'],
    queryFn: cargarDemandas,
    staleTime: 30_000,
    ...opciones,
  })
}

/** Autos en entrega que ofreció cada cliente (posibles vendedores). */
export function useOfertas(opciones = {}) {
  return useQuery({
    queryKey: ['crm', 'compradores', 'ofertas'],
    queryFn: cargarOfertas,
    staleTime: 30_000,
    ...opciones,
  })
}
