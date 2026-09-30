import { supabase } from '@/services/supabaseClient'
import { deleteMedia } from '@/services/media.service'
import { subirArchivoUnico } from './fotos.service.js'

const db = () => supabase.schema('crm')

export const GESTORIA_FOTO_SLOTS = ['seguro', 'titulo_frente', 'titulo_dorso']

/** Fotos de un slot documental (sin límite de cantidad), ordenadas. */
export async function listar(vehiculoId, slot) {
  const { data, error } = await db()
    .from('gestoria_fotos')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .eq('slot', slot)
    .order('orden', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Sube un archivo a R2 y lo registra en el slot (al final, sin límite). */
export async function agregar(vehiculoId, slot, file) {
  if (!GESTORIA_FOTO_SLOTS.includes(slot)) throw new Error(`Slot desconocido: ${slot}`)
  const url = await subirArchivoUnico(`crm/gestoria/${vehiculoId}/${slot}`, file)

  const { data: ult } = await db()
    .from('gestoria_fotos')
    .select('orden')
    .eq('vehiculo_id', vehiculoId)
    .eq('slot', slot)
    .order('orden', { ascending: false })
    .limit(1)
  const orden = (ult?.[0]?.orden ?? -1) + 1

  const { data, error } = await db()
    .from('gestoria_fotos')
    .insert({ vehiculo_id: vehiculoId, slot, url, orden })
    .select()
  if (error) {
    deleteMedia(url).catch(() => {})
    throw error
  }
  return data[0]
}

export async function borrar(id, url) {
  const { error } = await db().from('gestoria_fotos').delete().eq('id', id)
  if (error) throw error
  if (url) deleteMedia(url).catch((e) => console.warn('[gestoriaFotos] no se pudo borrar en R2', url, e.message))
}
