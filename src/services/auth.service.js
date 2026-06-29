import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Helpers de auth/perfil. La gestión de sesión vive en AuthProvider; esto
 *  cubre operaciones puntuales sobre el perfil. */

export async function updateProfile(id, updates) {
  if (!isSupabaseConfigured) return { ...updates, id }
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getProfile(id) {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (error) throw error
  return data
}
