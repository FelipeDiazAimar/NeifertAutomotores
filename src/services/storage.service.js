import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Sube un archivo a un bucket y devuelve la URL pública.
 *  En modo demo devuelve una object URL local. */
export async function uploadImage(bucket, file) {
  if (!isSupabaseConfigured) {
    return { url: URL.createObjectURL(file) }
  }
  const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, path }
}
