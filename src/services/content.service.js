import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Secciones de contenido del sitio que persisten en public.contenido_sitio
 *  (clave → JSON). Coinciden con los slices editables de useSiteStore. */
export const CONTENT_KEYS = [
  'home',
  'socials',
  'footer',
  'instagram',
  'stories',
  'categories',
  'heroSlides',
  'fuelTypes',
  'transmissions',
]

/** Trae todo el contenido → { home, socials, footer, instagram, stories }.
 *  En modo demo devuelve null (el store usa sus defaults de localStorage). */
export async function fetchSiteContent() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('contenido_sitio').select('clave, valor')
  if (error) throw error
  return Object.fromEntries(data.map((r) => [r.clave, r.valor]))
}

/** Guarda (upsert) una sección de contenido. No-op en modo demo. */
export async function saveSiteContent(key, value) {
  if (!isSupabaseConfigured) return
  const { error } = await supabase
    .from('contenido_sitio')
    .upsert({ clave: key, valor: value }, { onConflict: 'clave' })
  if (error) throw error
}
