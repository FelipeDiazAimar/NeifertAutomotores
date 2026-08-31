import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

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
