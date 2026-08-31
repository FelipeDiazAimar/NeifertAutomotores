import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

export async function listar(vehiculoId) {
  const { data, error } = await db()
    .from('vehiculo_fotos')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .order('orden', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function subir(vehiculoId, file, autorId) {
  const nombre = `crm/vehiculos/${vehiculoId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`

  const pre = await fetch('/api/r2/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: nombre, contentType: file.type }),
  })
  const json = await pre.json()
  if (!json?.ok) throw new Error(json?.error || 'No se pudo preparar la subida.')

  const put = await fetch(json.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!put.ok) throw new Error('Falló la subida del archivo.')

  const { data: ult } = await db()
    .from('vehiculo_fotos')
    .select('orden')
    .eq('vehiculo_id', vehiculoId)
    .order('orden', { ascending: false })
    .limit(1)
  const orden = (ult?.[0]?.orden ?? 0) + 1

  const { data, error } = await db()
    .from('vehiculo_fotos')
    .insert({ vehiculo_id: vehiculoId, url: json.publicUrl, orden, subida_por: autorId })
    .select()
  if (error) throw error
  return data[0]
}

export async function borrar(id) {
  const { error } = await db().from('vehiculo_fotos').delete().eq('id', id)
  if (error) throw error
}

export async function marcarPortada(vehiculoId, id) {
  const r1 = await db().from('vehiculo_fotos').update({ es_portada: false }).eq('vehiculo_id', vehiculoId)
  if (r1.error) throw r1.error
  const r2 = await db().from('vehiculo_fotos').update({ es_portada: true }).eq('id', id)
  if (r2.error) throw r2.error
}

export async function reordenar(ids) {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await db().from('vehiculo_fotos').update({ orden: i }).eq('id', ids[i])
    if (error) throw error
  }
}
