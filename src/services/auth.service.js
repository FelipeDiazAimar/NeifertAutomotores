import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Helpers de auth/perfil. La gestión de sesión vive en AuthProvider; esto
 *  cubre operaciones puntuales sobre el perfil. La tabla `perfiles` está en
 *  español (nombre_completo/rol/foto_url); acá se traduce al shape en inglés
 *  que usa el resto de la app (full_name/role/avatar_url). */

const toDbProfile = ({ full_name, role, avatar_url }) => ({
  ...(full_name !== undefined && { nombre_completo: full_name }),
  ...(role !== undefined && { rol: role }),
  ...(avatar_url !== undefined && { foto_url: avatar_url }),
})

const toAppProfile = (row) =>
  row && {
    id: row.id,
    full_name: row.nombre_completo,
    role: row.rol,
    avatar_url: row.foto_url,
  }

export async function updateProfile(id, updates) {
  if (!isSupabaseConfigured) return { ...updates, id }
  const { data, error } = await supabase
    .from('perfiles')
    .update(toDbProfile(updates))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return toAppProfile(data)
}

export async function getProfile(id) {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).single()
  if (error) throw error
  return toAppProfile(data)
}
