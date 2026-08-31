import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/crm/services/usuarios.service'

export function useUsuarios() {
  return useQuery({ queryKey: ['crm', 'usuarios'], queryFn: svc.listar })
}

export function useRolesCrm() {
  return useQuery({ queryKey: ['crm', 'roles'], queryFn: svc.roles })
}

export function useUsuarioMutations() {
  const qc = useQueryClient()
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'usuarios'] })
    qc.invalidateQueries({ queryKey: ['crm', 'roles'] })
    qc.invalidateQueries({ queryKey: ['crm', 'mis-vistas'] })
  }
  const fail = (e) =>
    toast.error(e.message?.includes('permission') ? 'No tenés permiso para esta acción.' : e.message)

  const actualizarUsuario = useMutation({
    mutationFn: ({ id, ...parche }) => svc.actualizarUsuario(id, parche),
    onSuccess: () => {
      invalidar()
      toast.success('Usuario actualizado.')
    },
    onError: fail,
  })
  const guardarRol = useMutation({
    mutationFn: ({ rol, vistas_default }) => svc.guardarRol(rol, vistas_default),
    onSuccess: () => {
      invalidar()
      toast.success('Rol actualizado.')
    },
    onError: fail,
  })
  const crearUsuario = useMutation({
    mutationFn: (data) => svc.crearUsuario(data),
    onSuccess: () => {
      invalidar()
      toast.success('Usuario creado.')
    },
    onError: fail,
  })
  const resetPassword = useMutation({
    mutationFn: ({ id, password }) => svc.resetPassword(id, password),
    onSuccess: () => toast.success('Contraseña actualizada.'),
    onError: fail,
  })

  return { actualizarUsuario, guardarRol, crearUsuario, resetPassword }
}
