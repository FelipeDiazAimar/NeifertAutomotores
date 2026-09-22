import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

const SELECT =
  '*, asignado:usuarios!alertas_asignado_a_fkey(nombre), cliente:clientes(nombre), vehiculo:vehiculos(marca,modelo)'

export async function listar({ filtros = {}, incluirHechas = false } = {}) {
  let q = db().from('alertas').select(SELECT)
  if (!incluirHechas) q = q.eq('hecha', false)
  if (filtros.asignadoA && filtros.asignadoA !== 'todos') q = q.eq('asignado_a', filtros.asignadoA)
  q = q.order('fecha', { ascending: true }).order('hora', { ascending: true })
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function contarPendientes(usuarioId) {
  const { count, error } = await db()
    .from('alertas')
    .select('id', { count: 'exact', head: true })
    .eq('hecha', false)
    .eq('asignado_a', usuarioId)
  if (error) throw error
  return count ?? 0
}

export async function crear(data, autorId) {
  const { data: filas, error } = await db().from('alertas').insert({ ...data, creado_por: autorId }).select()
  if (error) throw error
  return filas[0]
}

export async function actualizar(id, data) {
  const { data: filas, error } = await db().from('alertas').update(data).eq('id', id).select()
  if (error) throw error
  return filas[0]
}

export async function toggleHecha(id, hecha) {
  const { error } = await db().from('alertas').update({ hecha }).eq('id', id)
  if (error) throw error
}

export async function eliminar(id) {
  const { error } = await db().from('alertas').delete().eq('id', id)
  if (error) throw error
}
