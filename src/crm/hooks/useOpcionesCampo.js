import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as svc from '@/crm/services/opcionesCampo.service'

const KEY = ['crm', 'opciones-campo']

/** Opciones para los combobox del alta de vehiculos + accion para persistir
 *  los valores nuevos que el usuario tipea. */
export function useOpcionesCampo() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: KEY,
    queryFn: svc.listar,
    staleTime: 60_000,
  })

  const registrar = useMutation({
    mutationFn: (entradas) => svc.registrar(entradas),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  return {
    opciones: query.data ?? {},
    isLoading: query.isLoading,
    registrarNuevas: (entradas) => {
      if (entradas?.length) registrar.mutate(entradas)
    },
  }
}
