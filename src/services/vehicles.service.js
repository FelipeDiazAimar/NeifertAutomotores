import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_VEHICLES } from '@/lib/mockData'

const SORT_MAP = {
  'price-desc': ['price_usd', false],
  'price-asc': ['price_usd', true],
  'year-desc': ['year', false],
  'km-asc': ['km', true],
}

const DEMO_KEY = 'nf-vehicles'
const uid = () => 'v-' + Math.random().toString(36).slice(2, 10)

/* ----------------------------- modo demo ----------------------------- */

function loadDemo() {
  if (typeof localStorage === 'undefined') return [...MOCK_VEHICLES]
  const raw = localStorage.getItem(DEMO_KEY)
  if (!raw) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(MOCK_VEHICLES))
    return [...MOCK_VEHICLES]
  }
  try {
    return JSON.parse(raw)
  } catch {
    return [...MOCK_VEHICLES]
  }
}

function saveDemo(list) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(list))
}

function matchesFilters(v, { search, filters }) {
  if (search) {
    const q = search.toLowerCase()
    const hay =
      v.brand?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) ||
      String(v.year).includes(q)
    if (!hay) return false
  }
  if (filters) {
    const { fuels, transmissions, yearMin, yearMax, kmMin, kmMax } = filters
    if (fuels?.length && !fuels.includes(v.fuel_type)) return false
    if (transmissions?.length && !transmissions.includes(v.transmission)) return false
    if (yearMin != null && v.year < yearMin) return false
    if (yearMax != null && v.year > yearMax) return false
    if (kmMin != null && v.km < kmMin) return false
    if (kmMax != null && v.km > kmMax) return false
  }
  return true
}

function applyMock(list, { category, sort, search, filters, includeAll }) {
  let out = [...list]
  if (!includeAll) out = out.filter((v) => (v.status || 'disponible') === 'disponible')
  if (category && category !== 'todos') out = out.filter((v) => v.category === category)
  out = out.filter((v) => matchesFilters(v, { search, filters }))
  const [col, asc] = SORT_MAP[sort] || SORT_MAP['price-desc']
  out.sort((a, b) => (asc ? a[col] - b[col] : b[col] - a[col]))
  return out
}

/* ----------------------------- lecturas ------------------------------ */

export async function fetchVehicles({
  category = 'todos',
  sort = 'price-desc',
  search = '',
  filters = null,
  includeAll = false,
} = {}) {
  if (!isSupabaseConfigured) {
    return applyMock(loadDemo(), { category, sort, search, filters, includeAll })
  }

  let query = supabase.from('vehicles').select('*')
  if (!includeAll) query = query.eq('status', 'disponible')
  if (category !== 'todos') query = query.eq('category', category)
  if (search) {
    const numeric = /^\d{4}$/.test(search.trim())
    query = numeric
      ? query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,year.eq.${search.trim()}`)
      : query.or(`brand.ilike.%${search}%,model.ilike.%${search}%`)
  }
  if (filters) {
    if (filters.fuels?.length) query = query.in('fuel_type', filters.fuels)
    if (filters.transmissions?.length) query = query.in('transmission', filters.transmissions)
    if (filters.yearMin != null) query = query.gte('year', filters.yearMin)
    if (filters.yearMax != null) query = query.lte('year', filters.yearMax)
    if (filters.kmMin != null) query = query.gte('km', filters.kmMin)
    if (filters.kmMax != null) query = query.lte('km', filters.kmMax)
  }
  const [col, asc] = SORT_MAP[sort] || SORT_MAP['price-desc']
  query = query.order(col, { ascending: asc })

  const { data, error } = await query
  if (error) throw error
  return data
}

/** Todos los vehículos sin filtrar por estado (para el panel admin). */
export async function fetchAllVehicles() {
  if (!isSupabaseConfigured) return loadDemo()
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchVehicleById(id) {
  if (!isSupabaseConfigured) {
    return loadDemo().find((v) => v.id === id) || null
  }
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

/* ---------------------------- mutaciones ----------------------------- */

export async function createVehicle(payload) {
  if (!isSupabaseConfigured) {
    const list = loadDemo()
    const vehicle = {
      id: uid(),
      status: 'disponible',
      is_premium: false,
      images: [],
      created_at: new Date().toISOString(),
      ...payload,
      main_image_url: payload.main_image_url || payload.images?.[0] || null,
    }
    saveDemo([vehicle, ...list])
    return vehicle
  }
  const { data, error } = await supabase.from('vehicles').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateVehicle(id, patch) {
  if (!isSupabaseConfigured) {
    const list = loadDemo()
    const next = list.map((v) =>
      v.id === id
        ? { ...v, ...patch, main_image_url: patch.images?.[0] ?? patch.main_image_url ?? v.main_image_url }
        : v
    )
    saveDemo(next)
    return next.find((v) => v.id === id)
  }
  const { data, error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteVehicle(id) {
  if (!isSupabaseConfigured) {
    saveDemo(loadDemo().filter((v) => v.id !== id))
    return { id }
  }
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) throw error
  return { id }
}
