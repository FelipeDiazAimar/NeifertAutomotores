import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/tareas.service'

export function useTareas(opts) {
  return useQuery({
    queryKey: ['crm', 'tareas', opts],
    queryFn: () => svc.listar(opts),
  })
}

export function useTareasPendientesHoy() {
  const { id } = useCrmPerfil()
  return useQuery({
    queryKey: ['crm', 'tareas', 'pendientes-hoy', id],
    queryFn: () => svc.contarPendientesHoy(id),
    enabled: Boolean(id),
  })
}

export function useTareaMutations() {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'tareas'] })
    qc.invalidateQueries({ queryKey: ['crm', 'eventos'] })
  }
  const fail = (e) => toast.error(e.message.includes('permission') ? 'No tenés permiso para esta acción.' : e.message)

  const crear = useMutation({
    mutationFn: (data) => svc.crear(data, autorId),
    onSuccess: () => {
      invalidar()
      toast.success('Tarea creada.')
    },
    onError: fail,
  })
  const actualizar = useMutation({
    mutationFn: ({ id, data }) => svc.actualizar(id, data, autorId),
    onSuccess: () => {
      invalidar()
      toast.success('Tarea actualizada.')
    },
    onError: fail,
  })
  const toggleDone = useMutation({
    mutationFn: ({ id, done }) => svc.toggleDone(id, done, autorId),
    onSuccess: invalidar,
    onError: fail,
  })
  const archivar = useMutation({ mutationFn: (id) => svc.archivar(id), onSuccess: () => { invalidar(); toast.success('Tarea archivada.') }, onError: fail })
  const desarchivar = useMutation({ mutationFn: (id) => svc.desarchivar(id), onSuccess: invalidar, onError: fail })
  const eliminar = useMutation({ mutationFn: (id) => svc.eliminar(id), onSuccess: () => { invalidar(); toast.success('Tarea eliminada.') }, onError: fail })

  return { crear, actualizar, toggleDone, archivar, desarchivar, eliminar }
}
