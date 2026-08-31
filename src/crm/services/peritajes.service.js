import { supabase } from '@/services/supabaseClient'
import { resumenPeritaje } from '@/crm/lib/peritajeSchema'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

export async function listarPorVehiculo(vehiculoId) {
  const { data, error } = await db()
    .from('peritajes')
    .select('id, fecha, costo_total, items_ok, items_obs, items_falta, resena, peritado_por, peritador:usuarios(nombre)')
    .eq('vehiculo_id', vehiculoId)
    .order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function obtener(id) {
  const { data, error } = await db().from('peritajes').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function crear({ vehiculoId, datos, fecha, resena, costo_total, peritadoPor }) {
  const r = resumenPeritaje(datos)
  const { data, error } = await db()
    .from('peritajes')
    .insert({
      vehiculo_id: vehiculoId,
      datos,
      fecha: fecha || null,
      resena: resena || null,
      costo_total: costo_total ?? null,
      peritado_por: peritadoPor ?? null,
      ...r,
    })
    .select()
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'peritaje',
    datos: { peritaje_id: data[0].id, resumen: r }, usuarioId: peritadoPor,
  })
  return data[0]
}

export async function actualizar(id, { vehiculoId, datos, fecha, resena, costo_total, peritadoPor }) {
  const r = resumenPeritaje(datos)
  const { data, error } = await db()
    .from('peritajes')
    .update({ datos, fecha: fecha || null, resena: resena || null, costo_total: costo_total ?? null, ...r })
    .eq('id', id)
    .select()
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'peritaje',
    datos: { peritaje_id: id, resumen: r, editado: true }, usuarioId: peritadoPor,
  })
  return data[0]
}
