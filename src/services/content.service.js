import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Secciones de contenido del sitio que persisten en public.site_content
 *  (clave → JSON). Coinciden con los slices editables de useSiteStore. */
export const CONTENT_KEYS = ['home', 'socials', 'footer', 'instagram', 'stories', 'categories']

/** Trae todo el contenido → { home, socials, footer, instagram, stories }.
 *  En modo demo devuelve null (el store usa sus defaults de localStorage). */
export async function fetchSiteContent() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('site_content').select('key, value')
  if (error) throw error
  return Object.fromEntries(data.map((r) => [r.key, r.value]))
}

/** Guarda (upsert) una sección de contenido. No-op en modo demo. */
export async function saveSiteContent(key, value) {
  if (!isSupabaseConfigured) return
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, value }, { onConflict: 'key' })
  if (error) throw error
}
