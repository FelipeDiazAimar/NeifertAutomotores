import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/alertas.service'

export function useAlertas(opts) {
  return useQuery({ queryKey: ['crm', 'alertas', opts], queryFn: () => svc.listar(opts) })
}

export function useAlertasPendientes() {
  const { id } = useCrmPerfil()
  return useQuery({
    queryKey: ['crm', 'alertas', 'pendientes', id],
    queryFn: () => svc.contarPendientes(id),
    enabled: Boolean(id),
  })
}

export function useAlertaMutations() {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()
  const invalidar = () => qc.invalidateQueries({ queryKey: ['crm', 'alertas'] })
  const fail = (e) => toast.error(e.message)

  const crear = useMutation({
    mutationFn: (data) => svc.crear(data, autorId),
    onSuccess: () => { invalidar(); toast.success('Alerta creada.') },
    onError: fail,
  })
  const actualizar = useMutation({
    mutationFn: ({ id, data }) => svc.actualizar(id, data),
    onSuccess: () => { invalidar(); toast.success('Alerta actualizada.') },
    onError: fail,
  })
  const toggleHecha = useMutation({
    mutationFn: ({ id, hecha }) => svc.toggleHecha(id, hecha),
    onSuccess: invalidar,
    onError: fail,
  })
  const eliminar = useMutation({
    mutationFn: (id) => svc.eliminar(id),
    onSuccess: () => { invalidar(); toast.success('Alerta eliminada.') },
    onError: fail,
  })

  return { crear, actualizar, toggleHecha, eliminar }
}
