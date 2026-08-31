import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')
const hoyISO = () => new Date().toISOString().slice(0, 10)

const SELECT =
  '*, asignado:usuarios!tareas_asignado_a_fkey(nombre), cliente:clientes(nombre), vehiculo:vehiculos(marca,modelo)'

export async function listar({ filtros = {}, incluirHechas = false, incluirArchivadas = false } = {}) {
  let q = db().from('tareas').select(SELECT)

  if (!incluirHechas) q = q.eq('done', false)
  if (!incluirArchivadas) q = q.is('archivado_en', null)
  if (filtros.asignadoA && filtros.asignadoA !== 'todos') q = q.eq('asignado_a', filtros.asignadoA)
  if (filtros.prioridad?.length) q = q.in('prioridad', filtros.prioridad)
  if (filtros.soloConCliente) q = q.not('cliente_id', 'is', null)
  if (filtros.clienteId) q = q.eq('cliente_id', filtros.clienteId)

  q = q.order('fecha', { ascending: true }).order('hora', { ascending: true, nullsFirst: false })

  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function contarPendientesHoy(usuarioId) {
  const { count, error } = await db()
    .from('tareas')
    .select('id', { count: 'exact', head: true })
    .eq('done', false)
    .is('archivado_en', null)
    .lte('fecha', hoyISO())
    .eq('asignado_a', usuarioId)
  if (error) throw error
  return count ?? 0
}

function debeRegistrar(fila) {
  return fila.cliente_id || fila.vehiculo_id
}
async function evento(fila, done, autorId) {
  if (!debeRegistrar(fila)) return
  await registrar({
    entidad: fila.cliente_id ? 'cliente' : 'vehiculo',
    entidadId: fila.cliente_id ?? fila.vehiculo_id,
    tipo: 'tarea',
    datos: { titulo: fila.titulo, done },
    usuarioId: autorId,
  })
}

export async function crear(data, autorId) {
  const { data: filas, error } = await db()
    .from('tareas')
    .insert({ ...data, creado_por: autorId })
    .select()
  if (error) throw error
  const fila = filas[0]
  await evento(fila, false, autorId)
  return fila
}

export async function actualizar(id, data, autorId) {
  const { data: filas, error } = await db().from('tareas').update(data).eq('id', id).select()
  if (error) throw error
  const fila = filas[0]
  await evento(fila, fila.done, autorId)
  return fila
}

export async function toggleDone(id, done, autorId) {
  const { data: filas, error } = await db().from('tareas').update({ done }).eq('id', id).select()
  if (error) throw error
  await evento(filas[0], done, autorId)
}

export async function archivar(id) {
  const { error } = await db().from('tareas').update({ archivado_en: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function desarchivar(id) {
  const { error } = await db().from('tareas').update({ archivado_en: null }).eq('id', id)
  if (error) throw error
}

export async function eliminar(id) {
  const { error } = await db().from('tareas').delete().eq('id', id)
  if (error) throw error
}
