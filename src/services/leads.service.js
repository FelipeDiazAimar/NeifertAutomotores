import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_LEADS } from '@/lib/mockData'

/** Mapeo del filtro rápido del sidebar → estados de lead. */
export const QUICK_FILTER_STATUSES = {
  todos: null,
  nuevos: ['nuevo', 'primer_contacto'],
  seguimiento: ['seguimiento', 'negociacion', 'vip'],
  finalizados: ['cerrado'],
}

/* ------------------- traducción español (Supabase) <-> app ------------------
 * La tabla `prospectos` en Supabase tiene columnas en español; el resto de la
 * app sigue usando los nombres en inglés de siempre (full_name, status, etc.).
 * Esta es la única capa que traduce entre ambos mundos. */
const FIELD_MAP = {
  id: 'id', full_name: 'nombre_completo', phone: 'telefono', email: 'email',
  vehicle_interest: 'vehiculo_interes', source: 'origen', status: 'estado',
  notes: 'notas', contact_date: 'fecha_contacto', assigned_to: 'asignado_a',
  avatar_url: 'foto_url', external_id: 'id_externo', external_source: 'origen_externo',
  viewed_vehicles: 'vehiculos_vistos', synced_at: 'sincronizado_en',
  last_contact_at: 'ultimo_contacto_en', created_at: 'creado_en', updated_at: 'actualizado_en',
}
const FIELD_MAP_REVERSE = Object.fromEntries(Object.entries(FIELD_MAP).map(([en, es]) => [es, en]))

/** Exportada para que crmIntegration.service.js (ingesta del CRM externo)
 *  reutilice la misma traducción al insertar/actualizar en bloque. */
export function toDbLead(payload) {
  const row = {}
  for (const [enKey, val] of Object.entries(payload)) {
    if (FIELD_MAP[enKey]) row[FIELD_MAP[enKey]] = val
  }
  return row
}

function toAppLead(row) {
  if (!row) return row
  const out = {}
  for (const [esKey, val] of Object.entries(row)) {
    out[FIELD_MAP_REVERSE[esKey] || esKey] = val
  }
  return out
}

// MODO DEMO: copia mutable para que los leads creados aparezcan en la sesión.
let demoLeads = [...MOCK_LEADS]

function filterDemo({ quickFilter = 'todos', search = '' }) {
  let out = [...demoLeads]
  const statuses = QUICK_FILTER_STATUSES[quickFilter]
  if (statuses) out = out.filter((l) => statuses.includes(l.status))
  if (search) {
    const q = search.toLowerCase()
    out = out.filter(
      (l) =>
        l.full_name.toLowerCase().includes(q) ||
        (l.vehicle_interest || '').toLowerCase().includes(q)
    )
  }
  return out.sort((a, b) => new Date(b.last_contact_at) - new Date(a.last_contact_at))
}

export async function fetchLeads({ quickFilter = 'todos', search = '' } = {}) {
  if (!isSupabaseConfigured) return filterDemo({ quickFilter, search })

  let query = supabase.from('prospectos').select('*').order('ultimo_contacto_en', { ascending: false })
  const statuses = QUICK_FILTER_STATUSES[quickFilter]
  if (statuses) query = query.in('estado', statuses)
  if (search) query = query.or(`nombre_completo.ilike.%${search}%,vehiculo_interes.ilike.%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data.map(toAppLead)
}

export async function fetchLeadById(id) {
  if (!isSupabaseConfigured) return demoLeads.find((l) => l.id === id) || null
  const { data, error } = await supabase.from('prospectos').select('*').eq('id', id).single()
  if (error) throw error
  return toAppLead(data)
}

export async function fetchLeadCounts() {
  if (!isSupabaseConfigured) {
    const count = (key) => filterDemo({ quickFilter: key }).length
    return {
      todos: demoLeads.length,
      nuevos: count('nuevos'),
      seguimiento: count('seguimiento'),
      finalizados: count('finalizados'),
    }
  }
  const { data, error } = await supabase.from('prospectos').select('estado')
  if (error) throw error
  const has = (statuses) => data.filter((l) => statuses.includes(l.estado)).length
  return {
    todos: data.length,
    nuevos: has(QUICK_FILTER_STATUSES.nuevos),
    seguimiento: has(QUICK_FILTER_STATUSES.seguimiento),
    finalizados: has(QUICK_FILTER_STATUSES.finalizados),
  }
}

export async function createLead(payload) {
  if (!isSupabaseConfigured) {
    const lead = {
      id: 'l' + Date.now(),
      status: 'nuevo',
      avatar_url: `https://i.pravatar.cc/80?u=${encodeURIComponent(payload.email || Date.now())}`,
      created_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
      ...payload,
    }
    demoLeads = [lead, ...demoLeads]
    return lead
  }
  const { data, error } = await supabase.from('prospectos').insert(toDbLead(payload)).select().single()
  if (error) throw error
  return toAppLead(data)
}
