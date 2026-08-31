import { supabase } from '@/services/supabaseClient'

/** Perfil del CRM del usuario logueado (crm.usuarios). null si no tiene. */
export async function obtenerMiPerfil(userId) {
  const { data, error } = await supabase
    .schema('crm')
    .from('usuarios')
    .select('id, usuario, nombre, rol, activo')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Todos los usuarios del CRM (para selects de "peritado por", asignaciones, etc.). */
export async function listarUsuarios() {
  const { data, error } = await supabase
    .schema('crm')
    .from('usuarios')
    .select('id, usuario, nombre, rol, activo')
    .order('nombre')
  if (error) throw error
  return data ?? []
}
