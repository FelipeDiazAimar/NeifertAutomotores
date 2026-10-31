import { supabase } from '@/services/supabaseClient'
import { demandasDeCliente } from '@/crm/lib/compradores'

/** Líneas de interés de todos los clientes (sin archivar). Los vendidos y
 *  perdidos también vienen: la vista los separa al final. */
export async function cargarDemandas() {
  const { data, error } = await supabase
    .schema('crm')
    .from('clientes')
    .select(
      'id, nombre, telefono, status, marca_interes, modelo_interes, tipo_interes, presupuesto, interes_cero_km, intereses:cliente_intereses(*)'
    )
    .is('archivado_en', null)
  if (error) throw error
  return (data ?? []).flatMap(demandasDeCliente)
}
