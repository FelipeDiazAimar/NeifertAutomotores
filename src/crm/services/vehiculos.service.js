import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

const BUSQUEDA_CAMPOS = ['marca', 'modelo', 'version', 'patente', 'duenio_nombre', 'duenio_apellido']

/** Lista paginada + filtrada. `filtros`: { estado[], tipo[], moneda, anioMin,
 *  anioMax, precioMin, precioMax }. `orden`: { campo, dir }. */
export async function listar({
  busqueda = '',
  filtros = {},
  orden = { campo: 'creado_en', dir: 'desc' },
  pagina = 1,
  pageSize = 20,
  incluirArchivados = false,
} = {}) {
  let q = db()
    .from('vehiculos')
    .select(
      '*, fotos:vehiculo_fotos(url,es_portada), peritajes(items_ok,items_obs,items_falta,fecha), gestoria(estado)',
      { count: 'exact' },
    )

  if (!incluirArchivados) q = q.is('archivado_en', null)

  const b = busqueda.trim()
  if (b) q = q.or(BUSQUEDA_CAMPOS.map((c) => `${c}.ilike.%${b}%`).join(','))

  if (filtros.estado?.length) q = q.in('estado', filtros.estado)
  if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo)
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda)
  if (filtros.anioMin != null && filtros.anioMin !== '') q = q.gte('anio', Number(filtros.anioMin))
  if (filtros.anioMax != null && filtros.anioMax !== '') q = q.lte('anio', Number(filtros.anioMax))
  if (filtros.precioMin != null && filtros.precioMin !== '') q = q.gte('precio_contado', Number(filtros.precioMin))
  if (filtros.precioMax != null && filtros.precioMax !== '') q = q.lte('precio_contado', Number(filtros.precioMax))

  q = q
    .order(orden.campo, { ascending: orden.dir === 'asc' })
    .order('fecha', { referencedTable: 'peritajes', ascending: false })

  const from = (pagina - 1) * pageSize
  q = q.range(from, from + pageSize - 1)

  const { data, error, count } = await q
  if (error) throw error
  return { filas: data ?? [], total: count ?? 0 }
}

export async function obtener(id) {
  const { data, error } = await db()
    .from('vehiculos')
    .select('*, fotos:vehiculo_fotos(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function crear(data, autorId) {
  const { data: filas, error } = await db()
    .from('vehiculos')
    .insert({ ...data, creado_por: autorId, editado_por: autorId })
    .select()
  if (error) throw error
  const fila = filas[0]
  await registrar({ entidad: 'vehiculo', entidadId: fila.id, tipo: 'alta', usuarioId: autorId })
  return fila
}

export async function actualizar(id, data, autorId) {
  const { data: filas, error } = await db()
    .from('vehiculos')
    .update({ ...data, editado_por: autorId })
    .eq('id', id)
    .select()
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: id, tipo: 'edicion',
    datos: { campos: Object.keys(data) }, usuarioId: autorId,
  })
  return filas[0]
}

export async function cambiarEstado(id, estadoAnterior, estado, autorId) {
  const { error } = await db().from('vehiculos').update({ estado, editado_por: autorId }).eq('id', id)
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: id, tipo: 'cambio_estado',
    datos: { de: estadoAnterior, a: estado }, usuarioId: autorId,
  })
}

export async function archivar(id, autorId) {
  const { error } = await db()
    .from('vehiculos')
    .update({ archivado_en: new Date().toISOString(), editado_por: autorId })
    .eq('id', id)
  if (error) throw error
  await registrar({ entidad: 'vehiculo', entidadId: id, tipo: 'archivado', datos: { archivado: true }, usuarioId: autorId })
}

export async function desarchivar(id, autorId) {
  const { error } = await db().from('vehiculos').update({ archivado_en: null, editado_por: autorId }).eq('id', id)
  if (error) throw error
  await registrar({ entidad: 'vehiculo', entidadId: id, tipo: 'archivado', datos: { archivado: false }, usuarioId: autorId })
}

export async function eliminar(id) {
  const { error } = await db().from('vehiculos').delete().eq('id', id)
  if (error) throw error
}
