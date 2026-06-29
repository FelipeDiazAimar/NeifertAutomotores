import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_LEADS } from '@/lib/mockData'

/** Mapeo del filtro rápido del sidebar → estados de lead. */
export const QUICK_FILTER_STATUSES = {
  todos: null,
  nuevos: ['nuevo', 'primer_contacto'],
  seguimiento: ['seguimiento', 'negociacion', 'vip'],
  finalizados: ['cerrado'],
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

  let query = supabase.from('leads').select('*').order('last_contact_at', { ascending: false })
  const statuses = QUICK_FILTER_STATUSES[quickFilter]
  if (statuses) query = query.in('status', statuses)
  if (search) query = query.or(`full_name.ilike.%${search}%,vehicle_interest.ilike.%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchLeadById(id) {
  if (!isSupabaseConfigured) return demoLeads.find((l) => l.id === id) || null
  const { data, error } = await supabase.from('leads').select('*').eq('id', id).single()
  if (error) throw error
  return data
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
  const { data, error } = await supabase.from('leads').select('status')
  if (error) throw error
  const has = (statuses) => data.filter((l) => statuses.includes(l.status)).length
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
  const { data, error } = await supabase.from('leads').insert(payload).select().single()
  if (error) throw error
  return data
}
