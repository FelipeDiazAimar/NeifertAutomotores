import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_STORIES } from '@/lib/mockData'

/** Tabla `historias` en español; se traduce al shape en inglés (kind/title/
 *  video_url/…) que ya usa el resto de la app. */
const toAppStory = (row) => ({
  id: row.id,
  kind: row.tipo,
  title: row.titulo,
  video_url: row.url_video,
  poster_url: row.imagen_poster,
  duration: row.duracion,
  caption: row.leyenda,
  quote: row.cita,
  author_name: row.autor_nombre,
  author_role: row.autor_rol,
  order_index: row.orden,
  published: row.publicado,
})

export async function fetchStories() {
  if (!isSupabaseConfigured) {
    return [...MOCK_STORIES].sort((a, b) => a.order_index - b.order_index)
  }
  const { data, error } = await supabase
    .from('historias')
    .select('*')
    .eq('publicado', true)
    .order('orden', { ascending: true })
  if (error) throw error
  return data.map(toAppStory)
}
