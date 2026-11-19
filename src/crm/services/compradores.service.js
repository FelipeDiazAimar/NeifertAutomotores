import { supabase } from '@/services/supabaseClient'
import { demandasDeCliente, ofertasDeCliente } from '@/crm/lib/compradores'

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

/** Autos en entrega de todos los clientes (sin archivar): lo que cada uno
 *  ofrece, para buscar posibles vendedores. */
export async function cargarOfertas() {
  const { data, error } = await supabase
    .schema('crm')
    .from('clientes')
    .select('id, nombre, telefono, status, autos_entrega:cliente_autos_entrega(*)')
    .is('archivado_en', null)
  if (error) throw error
  return (data ?? []).flatMap(ofertasDeCliente)
}
