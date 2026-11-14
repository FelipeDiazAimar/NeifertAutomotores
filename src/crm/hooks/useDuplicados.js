import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as svc from '@/crm/services/clientes.service'
import { agruparDuplicados } from '@/crm/lib/leadCliente'

/** Clientes con el mismo teléfono. `grupos` ignora los archivados (igual que
 *  "en cartera"); `todos` trae a todos por si se quieren ver también. La
 *  query cuelga de ['crm','clientes'], así que se refresca sola al
 *  crear/editar/eliminar un cliente. */
export function useDuplicados() {
  const q = useQuery({
    queryKey: ['crm', 'clientes', 'duplicados'],
    queryFn: svc.listarParaDuplicados,
    staleTime: 60_000,
  })
  const todos = q.data
  const grupos = useMemo(
    () => agruparDuplicados((todos ?? []).filter((c) => !c.archivado_en)),
    [todos],
  )
  return { ...q, todos: todos ?? [], grupos }
}
