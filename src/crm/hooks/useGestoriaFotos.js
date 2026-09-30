import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/crm/services/gestoriaFotos.service'

export function useGestoriaFotos(vehiculoId, slot) {
  return useQuery({
    queryKey: ['crm', 'gestoria-fotos', vehiculoId, slot],
    queryFn: () => svc.listar(vehiculoId, slot),
    enabled: Boolean(vehiculoId && slot),
  })
}

export function useGestoriaFotosMutations(vehiculoId, slot) {
  const qc = useQueryClient()
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'gestoria-fotos', vehiculoId, slot] })
  }

  const agregar = useMutation({
    mutationFn: (file) => svc.agregar(vehiculoId, slot, file),
    onSuccess: () => {
      invalidar()
      toast.success('Foto subida correctamente.')
    },
    onError: (e) => toast.error(e.message),
  })

  const borrar = useMutation({
    mutationFn: ({ id, url }) => svc.borrar(id, url),
    onSuccess: () => {
      invalidar()
      toast.success('Foto eliminada.')
    },
    onError: (e) => toast.error(e.message),
  })

  return { agregar, borrar }
}
