import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

const BUSQUEDA_CAMPOS = ['marca', 'modelo', 'version', 'patente', 'duenio_nombre', 'duenio_apellido']

/** Lista paginada + filtrada. `filtros`: { estado[], tipo[], moneda, condicion
 *  ('cero' | 'usados' | ''), anioMin, anioMax, precioMin, precioMax }.
 *  `orden`: { campo, dir } — por defecto marca A-Z. Sin filtro de archivados:
 *  todo vehículo se ve en la lista y se da de baja con estado='baja'. */
export async function listar({
  busqueda = '',
  filtros = {},
  orden = { campo: 'marca', dir: 'asc' },
  pagina = 1,
  pageSize = 20,
} = {}) {
  let q = db()
    .from('vehiculos')
    .select(
      '*, fotos:vehiculo_fotos(url,es_portada), peritajes(items_ok,items_obs,items_falta,fecha), gestoria(estado)',
      { count: 'exact' },
    )

  const b = busqueda.trim()
  if (b) q = q.or(BUSQUEDA_CAMPOS.map((c) => `${c}.ilike.%${b}%`).join(','))

  if (filtros.estado?.length) q = q.in('estado', filtros.estado)
  if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo)
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda)
  if (filtros.condicion === 'cero') q = q.eq('es_0km', true)
  else if (filtros.condicion === 'usados') q = q.or('es_0km.is.false,es_0km.is.null')
  if (filtros.anioMin != null && filtros.anioMin !== '') q = q.gte('anio', Number(filtros.anioMin))
  if (filtros.anioMax != null && filtros.anioMax !== '') q = q.lte('anio', Number(filtros.anioMax))
  if (filtros.precioMin != null && filtros.precioMin !== '') q = q.gte('precio_contado', Number(filtros.precioMin))
  if (filtros.precioMax != null && filtros.precioMax !== '') q = q.lte('precio_contado', Number(filtros.precioMax))

  q = q
    .order(orden.campo, { ascending: orden.dir === 'asc' })
  // Desempates estables: marca A-Z y luego modelo A-Z, para que la lista
  // quede agrupada por marca aunque haya marcas iguales.
  if (orden.campo !== 'marca') q = q.order('marca', { ascending: true })
  if (orden.campo !== 'modelo') q = q.order('modelo', { ascending: true })
  q = q.order('fecha', { referencedTable: 'peritajes', ascending: false })

  const from = (pagina - 1) * pageSize
  q = q.range(from, from + pageSize - 1)

  const { data, error, count } = await q
  if (error) throw error
  return { filas: data ?? [], total: count ?? 0 }
}

/** Stock completo para la planilla DOCX: misma búsqueda/filtros que `listar`
 *  pero sin paginar (trae todo en tandas) y ordenado por marca. Solo trae
 *  las columnas que usa la planilla. */
export async function listarTodoStock({ busqueda = '', filtros = {} } = {}) {
  const CHUNK = 1000
  const todas = []
  for (let from = 0; ; from += CHUNK) {
    let q = db()
      .from('vehiculos')
      .select('marca, modelo, version, anio, km, moneda, precio_contado, precio_canje, duenio_nombre, duenio_apellido, duenio_contacto, estado, es_0km')

    const b = busqueda.trim()
    if (b) q = q.or(BUSQUEDA_CAMPOS.map((c) => `${c}.ilike.%${b}%`).join(','))

    if (filtros.estado?.length) q = q.in('estado', filtros.estado)
    if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo)
    if (filtros.moneda) q = q.eq('moneda', filtros.moneda)
    if (filtros.condicion === 'cero') q = q.eq('es_0km', true)
    else q = q.or('es_0km.is.false,es_0km.is.null')
    if (filtros.anioMin != null && filtros.anioMin !== '') q = q.gte('anio', Number(filtros.anioMin))
    if (filtros.anioMax != null && filtros.anioMax !== '') q = q.lte('anio', Number(filtros.anioMax))
    if (filtros.precioMin != null && filtros.precioMin !== '') q = q.gte('precio_contado', Number(filtros.precioMin))
    if (filtros.precioMax != null && filtros.precioMax !== '') q = q.lte('precio_contado', Number(filtros.precioMax))

    q = q.order('marca', { ascending: true }).order('modelo', { ascending: true }).range(from, from + CHUNK - 1)
    const { data, error } = await q
    if (error) throw error
    todas.push(...(data ?? []))
    if ((data ?? []).length < CHUNK) break
  }
  return todas
}

/** Recuento por estado + pendientes para el encabezado de la lista. Aplica la
 *  misma búsqueda y filtros que `listar`, salvo el propio filtro de estado
 *  (para que los números sean estables al filtrar por estado).
 *  - sinPeritar: vehículos sin fila en `peritajes`.
 *  - sinGestoria: vehículos sin fila en `gestoria` o con estado 'sin_iniciar'. */
export async function contarPorEstado({ busqueda = '', filtros = {} } = {}) {
  let q = db().from('vehiculos').select('estado, peritajes(id), gestoria(estado)')

  const b = busqueda.trim()
  if (b) q = q.or(BUSQUEDA_CAMPOS.map((c) => `${c}.ilike.%${b}%`).join(','))

  if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo)
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda)
  if (filtros.condicion === 'cero') q = q.eq('es_0km', true)
  else if (filtros.condicion === 'usados') q = q.or('es_0km.is.false,es_0km.is.null')
  if (filtros.anioMin != null && filtros.anioMin !== '') q = q.gte('anio', Number(filtros.anioMin))
  if (filtros.anioMax != null && filtros.anioMax !== '') q = q.lte('anio', Number(filtros.anioMax))
  if (filtros.precioMin != null && filtros.precioMin !== '') q = q.gte('precio_contado', Number(filtros.precioMin))
  if (filtros.precioMax != null && filtros.precioMax !== '') q = q.lte('precio_contado', Number(filtros.precioMax))

  const { data, error } = await q
  if (error) throw error
  const conteo = { disponible: 0, reservado: 0, vendido: 0, baja: 0, sinPeritar: 0, sinGestoria: 0 }
  for (const f of data ?? []) {
    if (f.estado in conteo) conteo[f.estado]++
    const per = f.peritajes
    const tienePeritaje = Array.isArray(per) ? per.length > 0 : Boolean(per?.id ?? per)
    if (!tienePeritaje) conteo.sinPeritar++
    let g = f.gestoria
    if (Array.isArray(g)) g = g[0] ?? null
    if (!g || !g.estado || g.estado === 'sin_iniciar') conteo.sinGestoria++
  }
  return conteo
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

export async function eliminar(id) {
  const { error } = await db().from('vehiculos').delete().eq('id', id)
  if (error) throw error
}
