import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

/** Todas las gestorías (para la sección dedicada). `estado` filtra por
 *  sin_iniciar / en_proceso / completo. */
export async function listarTodas({ estado } = {}) {
  let q = db()
    .from('gestoria')
    .select('*, vehiculo:vehiculos!inner(id, marca, modelo, patente, estado)')
    .order('actualizado_en', { ascending: false })
  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function obtenerPorVehiculo(vehiculoId) {
  const { data, error } = await db()
    .from('gestoria')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Upsert parcial de la fila de gestoría (1-1 por vehículo). El trigger de la
 *  DB recalcula `estado`. */
export async function guardarCampos(vehiculoId, parche, autorId) {
  const { error } = await db()
    .from('gestoria')
    .upsert({ vehiculo_id: vehiculoId, ...parche }, { onConflict: 'vehiculo_id' })
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'gestoria',
    datos: { campos: Object.keys(parche) }, usuarioId: autorId,
  })
}
