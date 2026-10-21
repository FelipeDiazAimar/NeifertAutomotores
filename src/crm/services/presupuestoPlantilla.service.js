import { supabase } from '@/services/supabaseClient'
import { PRESUPUESTO_DEFAULTS, cargarPlantillaGuardada } from '../lib/presupuestoTemplate'

const FILA_ID = 1

function normalizar(datos) {
  if (!datos || typeof datos !== 'object') return {}
  return datos
}

/** Plantilla compartida (crm.presupuesto_plantilla, fila única).
 *  Si la tabla está vacía, siembra con la plantilla del navegador o defaults.
 *  El insert puede fallar por RLS (vendedor): igual se devuelve la semilla. */
export async function obtenerPlantilla() {
  const { data, error } = await supabase
    .schema('crm')
    .from('presupuesto_plantilla')
    .select('datos')
    .eq('id', FILA_ID)
    .maybeSingle()
  if (error) throw error
  if (data?.datos && Object.keys(data.datos).length > 0) return normalizar(data.datos)
  const semilla = { ...PRESUPUESTO_DEFAULTS, ...cargarPlantillaGuardada() }
  try {
    await supabase.schema('crm').from('presupuesto_plantilla').insert({ id: FILA_ID, datos: semilla })
  } catch {
    // Sin permiso de escritura (vendedor) o tabla aún no migrada: se usa la semilla en memoria
  }
  return semilla
}

export async function guardarPlantillaDB(plantilla) {
  const { error } = await supabase
    .schema('crm')
    .from('presupuesto_plantilla')
    .upsert({ id: FILA_ID, datos: plantilla, actualizado_en: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
}
