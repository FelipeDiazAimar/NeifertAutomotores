import { supabase, isSupabaseConfigured } from './supabaseClient'
import { toDbLead } from './leads.service'

/** Ingesta READ-ONLY de la cartera completa de clientes/leads del CRM viejo
 *  (WhatsApp de la empresa + gente presencial del salón + los que ya
 *  llegaron por la web) hacia nuestra tabla `prospectos`, etiquetados por
 *  origen, para unificar el embudo con nuestros propios leads.
 *
 *  Fuente: GET /api/crm/clientes → panel interno del CRM viejo (login de
 *  empleado, ver src/server/crmCore.js). NO es la API pública que nos
 *  dieron oficialmente (esa solo expone los leads que nosotros mismos
 *  empujamos, ver leads.service.js#pushExternalLead) — este endpoint lo
 *  encontramos en la captura de red de su propio panel y lo usamos con
 *  credenciales de un empleado real. */

const EXTERNAL_SOURCE = 'crm_enlatado'

// canal (CRM viejo) → origen (nuestro enum). Lo no reconocido cae a
// 'WhatsApp' — es el canal genérico más probable para contacto directo
// (llamada, "otro", ya_cliente, vacío).
const CANAL_TO_ORIGEN = {
  salon: 'Showroom',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

// status (CRM viejo) → estado (nuestro enum). No conocemos su pipeline
// interno más allá de activo/vendido, así que todo lo "activo" entra como
// 'nuevo' (se puede reclasificar a mano en nuestro panel).
const STATUS_TO_ESTADO = {
  vendido: 'cerrado',
}

/** Arma un texto de notas legible a partir de los campos sueltos que no
 *  tienen equivalente directo en nuestro esquema (presupuesto, año buscado,
 *  auto de entrega, etc.) — para no perder esa información. */
function buildNotes(raw) {
  const parts = []
  const busca = [raw.tipo, raw.trans, raw.year_min || raw.year_max ? `${raw.year_min ?? '?'}-${raw.year_max ?? '?'}` : null]
    .filter(Boolean)
    .join(', ')
  if (busca) parts.push(`Busca: ${busca}`)
  if (raw.budget) parts.push(`Presupuesto: $${Number(raw.budget).toLocaleString('es-AR')}`)
  if (raw.tieneAutoEntrega && raw.ae_brand) {
    parts.push(`Entrega: ${[raw.ae_brand, raw.ae_model, raw.ae_year].filter(Boolean).join(' ')}`)
  }
  if (raw.notes) parts.push(raw.notes)
  return parts.join(' — ') || null
}

/** Mapea un cliente crudo del CRM viejo (clientes.php) → nuestro shape de
 *  `leads`. Ver muestra real de campos en scraping/Harfiles/neifert.har. */
export function mapExternalLead(raw) {
  return {
    external_id: String(raw.id),
    external_source: EXTERNAL_SOURCE,
    full_name: raw.name || 'Sin nombre',
    phone: raw.phone || null,
    email: null,
    // Combina marca+modelo+tipo (no exclusivo): si solo tienen el tipo
    // cargado ("Pickup"), se muestra igual, pero apenas hay algo más
    // específico (marca/modelo) se agrega en vez de perderlo.
    vehicle_interest: [raw.brand, raw.model, raw.tipo].filter(Boolean).join(' ') || null,
    source: CANAL_TO_ORIGEN[raw.canal] || 'WhatsApp',
    status: STATUS_TO_ESTADO[raw.status] || 'nuevo',
    notes: buildNotes(raw),
    last_contact_at: raw.updated_at || raw.created_at || new Date().toISOString(),
    created_at: raw.created_at || undefined,
    synced_at: new Date().toISOString(),
  }
}

/** Trae la cartera completa del CRM viejo vía nuestro proxy (evita CORS y
 *  nunca expone credenciales al navegador). */
export async function fetchExternalLeads() {
  const res = await fetch('/api/crm/clientes')
  const json = await res.json()
  if (!json?.ok) throw new Error(json?.error || 'No se pudo conectar con el CRM viejo.')
  return json.data || []
}

/** Ingesta: upsert por external_id en `prospectos` (deduplica). Devuelve
 *  cuántos se procesaron. No-op sin Supabase o sin datos. */
export async function ingestExternalLeads(rawList) {
  if (!isSupabaseConfigured || !rawList?.length) return { count: 0 }
  const rows = rawList.map(mapExternalLead).filter((r) => r.external_id).map(toDbLead)
  if (!rows.length) return { count: 0 }
  const { error } = await supabase.from('prospectos').upsert(rows, { onConflict: 'id_externo' })
  if (error) throw error
  return { count: rows.length }
}

/** Sincronización completa (para el botón de /admin/crm o un auto-sync al entrar). */
export async function syncExternalCrm() {
  const raw = await fetchExternalLeads()
  return ingestExternalLeads(raw)
}
