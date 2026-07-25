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

// sort (ver LEAD_SORT_OPTIONS en lib/constants.js) → [columna, ascendente].
// Se comparte entre el modo real (columna de Supabase) y el demo (columna app).
const SORT_MAP = {
  'date-desc': ['last_contact_at', false],
  'date-asc': ['last_contact_at', true],
  'name-asc': ['full_name', true],
  'name-desc': ['full_name', false],
}
const SORT_MAP_DB = {
  'date-desc': ['ultimo_contacto_en', false],
  'date-asc': ['ultimo_contacto_en', true],
  'name-asc': ['nombre_completo', true],
  'name-desc': ['nombre_completo', false],
}

function applySortDemo(list, sort) {
  const [col, asc] = SORT_MAP[sort] || SORT_MAP['date-desc']
  return [...list].sort((a, b) => {
    if (col === 'full_name') {
      return asc ? a.full_name.localeCompare(b.full_name) : b.full_name.localeCompare(a.full_name)
    }
    const diff = new Date(a[col]) - new Date(b[col])
    return asc ? diff : -diff
  })
}

function filterDemo({ quickFilter = 'todos', search = '', sort = 'date-desc', origin = 'todos' }) {
  let out = [...demoLeads]
  const statuses = QUICK_FILTER_STATUSES[quickFilter]
  if (statuses) out = out.filter((l) => statuses.includes(l.status))
  if (origin !== 'todos') out = out.filter((l) => l.source === origin)
  if (search) {
    const q = search.toLowerCase()
    out = out.filter(
      (l) =>
        l.full_name.toLowerCase().includes(q) ||
        (l.vehicle_interest || '').toLowerCase().includes(q)
    )
  }
  return applySortDemo(out, sort)
}

export async function fetchLeads({
  quickFilter = 'todos',
  search = '',
  sort = 'date-desc',
  origin = 'todos',
} = {}) {
  if (!isSupabaseConfigured) return filterDemo({ quickFilter, search, sort, origin })

  const [col, asc] = SORT_MAP_DB[sort] || SORT_MAP_DB['date-desc']
  let query = supabase.from('prospectos').select('*').order(col, { ascending: asc })
  const statuses = QUICK_FILTER_STATUSES[quickFilter]
  if (statuses) query = query.in('estado', statuses)
  if (origin !== 'todos') query = query.eq('origen', origin)
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

/** Empuja el lead nuevo a la API pública del CRM viejo (best-effort: no
 *  bloquea ni rompe la creación del lead si su API falla). No se empuja si
 *  el lead ya vino DE un sistema externo (evita eco/circularidad) ni si
 *  falta el teléfono (obligatorio para ellos). */
function pushExternalLead(lead) {
  if (lead.external_source || !lead.phone) return
  const notes = [lead.vehicle_interest && `Interés: ${lead.vehicle_interest}`, lead.notes]
    .filter(Boolean)
    .join(' — ')
  fetch('/api/crm/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lead.full_name, phone: lead.phone, notes: notes || undefined }),
  })
    .then((r) => r.json())
    .then((json) => {
      if (!json?.ok) console.warn('[crm-ext] no se pudo empujar el lead:', json?.error)
    })
    .catch((e) => console.warn('[crm-ext] no se pudo empujar el lead:', e.message))
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
    pushExternalLead(lead)
    return lead
  }
  const { data, error } = await supabase.from('prospectos').insert(toDbLead(payload)).select().single()
  if (error) throw error
  const lead = toAppLead(data)
  pushExternalLead(lead)
  return lead
}
