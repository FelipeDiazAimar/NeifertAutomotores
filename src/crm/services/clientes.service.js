import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')
const hoy = () => new Date().toISOString().slice(0, 10)

const BUSQUEDA_CAMPOS = ['nombre', 'telefono', 'localidad']

export async function listar({
  busqueda = '',
  filtros = {},
  orden = { campo: 'creado_en', dir: 'desc' },
  pagina = 1,
  pageSize = 20,
  incluirArchivados = false,
} = {}) {
  let q = db().from('clientes').select('*, intereses:cliente_intereses(marca,modelo)', { count: 'exact' })

  if (!incluirArchivados) q = q.is('archivado_en', null)

  const b = busqueda.trim()
  if (b) q = q.or(BUSQUEDA_CAMPOS.map((c) => `${c}.ilike.%${b}%`).join(','))

  if (filtros.status?.length) q = q.in('status', filtros.status)
  if (filtros.canal?.length) q = q.in('canal', filtros.canal)
  if (filtros.conAutoEntrega) q = q.eq('tiene_auto_entrega', true)
  if (filtros.interesCeroKm) q = q.eq('interes_cero_km', true)

  q = q.order(orden.campo, { ascending: orden.dir === 'asc' })
  const from = (pagina - 1) * pageSize
  q = q.range(from, from + pageSize - 1)

  const { data, error, count } = await q
  if (error) throw error
  return { filas: data ?? [], total: count ?? 0 }
}

export async function obtener(id) {
  const { data, error } = await db()
    .from('clientes')
    .select('*, intereses:cliente_intereses(*), autos_entrega:cliente_autos_entrega(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function crear(data, autorId) {
  const { data: filas, error } = await db()
    .from('clientes')
    .insert({ ...data, creado_por: autorId, editado_por: autorId })
    .select()
  if (error) throw error
  const fila = filas[0]
  await registrar({ entidad: 'cliente', entidadId: fila.id, tipo: 'alta', usuarioId: autorId })
  return fila
}

export async function actualizar(id, data, autorId) {
  const { data: filas, error } = await db()
    .from('clientes')
    .update({ ...data, editado_por: autorId })
    .eq('id', id)
    .select()
  if (error) throw error
  await registrar({
    entidad: 'cliente', entidadId: id, tipo: 'edicion',
    datos: { campos: Object.keys(data) }, usuarioId: autorId,
  })
  return filas[0]
}

export async function cambiarStatus(id, de, a, autorId) {
  const { error } = await db().from('clientes').update({ status: a, editado_por: autorId }).eq('id', id)
  if (error) throw error
  await registrar({ entidad: 'cliente', entidadId: id, tipo: 'cambio_estado', datos: { de, a }, usuarioId: autorId })
}

export async function archivar(id, autorId) {
  const { error } = await db().from('clientes').update({ archivado_en: new Date().toISOString(), editado_por: autorId }).eq('id', id)
  if (error) throw error
  await registrar({ entidad: 'cliente', entidadId: id, tipo: 'archivado', datos: { archivado: true }, usuarioId: autorId })
}

export async function desarchivar(id, autorId) {
  const { error } = await db().from('clientes').update({ archivado_en: null, editado_por: autorId }).eq('id', id)
  if (error) throw error
  await registrar({ entidad: 'cliente', entidadId: id, tipo: 'archivado', datos: { archivado: false }, usuarioId: autorId })
}

export async function eliminar(id) {
  const { error } = await db().from('clientes').delete().eq('id', id)
  if (error) throw error
}

export async function registrarVenta(clienteId, vehiculoId, estadoVehiculoAnterior, autorId) {
  const f = hoy()
  const c = await db()
    .from('clientes')
    .update({ status: 'vendido', venta_vehiculo_id: vehiculoId, fecha_venta: f, editado_por: autorId })
    .eq('id', clienteId)
  if (c.error) throw c.error

  const v = await db()
    .from('vehiculos')
    .update({ estado: 'vendido', venta_cliente_id: clienteId, fecha_venta: f, editado_por: autorId })
    .eq('id', vehiculoId)
  if (v.error) throw v.error

  await registrar({ entidad: 'cliente', entidadId: clienteId, tipo: 'venta', datos: { vehiculo_id: vehiculoId }, usuarioId: autorId })
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'cambio_estado',
    datos: { de: estadoVehiculoAnterior ?? null, a: 'vendido', cliente_id: clienteId }, usuarioId: autorId,
  })
}

// --- intereses ---
export async function agregarInteres(clienteId, { marca, modelo }) {
  const { data, error } = await db().from('cliente_intereses').insert({ cliente_id: clienteId, marca, modelo }).select()
  if (error) throw error
  return data[0]
}
export async function quitarInteres(id) {
  const { error } = await db().from('cliente_intereses').delete().eq('id', id)
  if (error) throw error
}

// --- autos en entrega ---
export async function agregarAutoEntrega(clienteId, data) {
  const { data: filas, error } = await db().from('cliente_autos_entrega').insert({ cliente_id: clienteId, ...data }).select()
  if (error) throw error
  return filas[0]
}
export async function quitarAutoEntrega(id) {
  const { error } = await db().from('cliente_autos_entrega').delete().eq('id', id)
  if (error) throw error
}

// --- seguimiento ---
export async function agregarContacto(clienteId, texto, autorId) {
  await registrar({ entidad: 'cliente', entidadId: clienteId, tipo: 'contacto', datos: { texto }, usuarioId: autorId })
}
