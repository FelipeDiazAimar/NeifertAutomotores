import { supabase, isSupabaseConfigured } from './supabaseClient'
import { toDbLead } from './leads.service'

/** Integración con el CRM externo (enlatado). Es READ-ONLY: ingerimos SUS leads
 *  (WhatsApp de la empresa + gente que va presencial al salón) a nuestra tabla
 *  `prospectos`, etiquetados por origen, para unificar el embudo y el dashboard
 *  con nuestros propios leads (web/IG/FB/catálogo).
 *
 *  PENDIENTE (cuando tengamos acceso a su API, ~2026-07-14):
 *   - Definir baseURL + auth (API key / OAuth) en variables de entorno.
 *   - Completar mapExternalLead() con el shape real de sus respuestas.
 *   - Reemplazar fetchExternalLeads() por la llamada real (o recibir un webhook).
 */

/** Mapea un lead crudo del CRM externo → nuestro shape de `leads`.
 *  TODO: ajustar los nombres de campo al contrato real del enlatado. */
export function mapExternalLead(raw) {
  return {
    external_id: String(raw.id ?? raw.lead_id ?? ''),
    external_source: 'crm_enlatado',
    full_name: raw.name ?? raw.full_name ?? 'Sin nombre',
    phone: raw.phone ?? raw.telefono ?? null,
    email: raw.email ?? null,
    vehicle_interest: raw.vehicle ?? raw.interes ?? null,
    // Origen: WhatsApp de la empresa vs. visita presencial al salón
    source: raw.channel === 'whatsapp' ? 'WhatsApp' : 'Showroom',
    status: raw.status ?? 'nuevo',
    notes: raw.notes ?? null,
    last_contact_at: raw.last_contact_at ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  }
}

/** Trae los leads del CRM externo. STUB: hoy no hay API → devuelve []. */
export async function fetchExternalLeads(/* { since } = {} */) {
  // TODO: fetch(`${CRM_BASE_URL}/leads?since=...`, { headers: { Authorization } })
  return []
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

/** Sincronización completa (para un botón admin, un cron o un webhook receiver). */
export async function syncExternalCrm() {
  const raw = await fetchExternalLeads()
  return ingestExternalLeads(raw)
}
