import { useContext } from 'react'
import { AuthContext } from '@/context/authContext'

/** Perfil del CRM del usuario logueado, derivado del AuthContext. */
export function useCrmPerfil() {
  const { crmPerfil, crmPerfilCargando } = useContext(AuthContext) ?? {}
  return {
    id: crmPerfil?.id ?? null,
    usuario: crmPerfil?.usuario ?? null,
    nombre: crmPerfil?.nombre ?? null,
    rol: crmPerfil?.rol ?? null,
    esAdmin: crmPerfil?.rol === 'admin',
    activo: crmPerfil?.activo ?? false,
    cargando: Boolean(crmPerfilCargando),
  }
}
