import { useContext } from 'react'
import { AuthContext } from '@/context/authContext'

/** Acceso a la sesión, el perfil y las acciones de auth. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
