import { supabase } from '@/services/supabaseClient'

/** Registra un evento en la bitácora (crm.eventos). Peritajes y gestoría
 *  registran con entidad='vehiculo' y entidad_id=<vehiculoId> para que una
 *  sola query traiga todo el historial del vehículo. */
export async function registrar({ entidad, entidadId, tipo, datos = {}, usuarioId = null }) {
  const { error } = await supabase.schema('crm').from('eventos').insert({
    entidad,
    entidad_id: String(entidadId),
    tipo,
    datos,
    usuario_id: usuarioId,
  })
  if (error) throw error
}

/** Historial de una entidad (vehículo o cliente), orden descendente. */
export async function listarDeEntidad(entidad, id) {
  const { data, error } = await supabase
    .schema('crm')
    .from('eventos')
    .select('id, tipo, datos, usuario_id, creado_en, usuario:usuarios(nombre)')
    .eq('entidad', entidad)
    .eq('entidad_id', String(id))
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data ?? []
}

export const listarDeVehiculo = (vehiculoId) => listarDeEntidad('vehiculo', vehiculoId)
