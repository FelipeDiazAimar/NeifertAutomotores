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

/* ------------------- traducción español (Supabase) <-> app ------------------
 * La tabla `vehiculos` en Supabase tiene columnas en español; el resto de la
 * app (componentes, hooks, filtros, búsqueda) sigue usando los nombres en
 * inglés de siempre. Esta es la única capa que traduce entre ambos mundos. */
const FIELD_MAP = {
  id: 'id', brand: 'marca', model: 'modelo', version: 'version', color: 'color',
  year: 'anio', currency: 'moneda', price_amount: 'precio', price_usd: 'precio_usd',
  km: 'km', fuel_type: 'combustible', transmission: 'transmision', engine: 'motor',
  category: 'categoria', is_new: 'es_nuevo', status: 'estado',
  main_image_url: 'imagen_principal', images: 'imagenes', description: 'descripcion',
  view_count: 'vistas', external_id: 'id_externo', external_source: 'origen_externo',
  external_snapshot: 'snapshot_externo', external_synced_at: 'sincronizado_en',
  created_at: 'creado_en', updated_at: 'actualizado_en',
}
const FIELD_MAP_REVERSE = Object.fromEntries(Object.entries(FIELD_MAP).map(([en, es]) => [es, en]))
const dbCol = (enKey) => FIELD_MAP[enKey] || enKey

function toDbVehicle(payload) {
  const row = {}
  for (const [enKey, val] of Object.entries(payload)) {
    if (FIELD_MAP[enKey]) row[FIELD_MAP[enKey]] = val
  }
  return row
}

function toAppVehicle(row) {
  if (!row) return row
  const out = {}
  for (const [esKey, val] of Object.entries(row)) {
    out[FIELD_MAP_REVERSE[esKey] || esKey] = val
  }
  return out
}

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

  let query = supabase.from('vehiculos').select('*')
  if (!includeAll) query = query.eq('estado', 'disponible')
  if (category !== 'todos') query = query.eq('categoria', category)
  if (search) {
    const numeric = /^\d{4}$/.test(search.trim())
    query = numeric
      ? query.or(`marca.ilike.%${search}%,modelo.ilike.%${search}%,anio.eq.${search.trim()}`)
      : query.or(`marca.ilike.%${search}%,modelo.ilike.%${search}%`)
  }
  if (filters) {
    if (filters.fuels?.length) query = query.in('combustible', filters.fuels)
    if (filters.transmissions?.length) query = query.in('transmision', filters.transmissions)
    if (filters.yearMin != null) query = query.gte('anio', filters.yearMin)
    if (filters.yearMax != null) query = query.lte('anio', filters.yearMax)
    if (filters.kmMin != null) query = query.gte('km', filters.kmMin)
    if (filters.kmMax != null) query = query.lte('km', filters.kmMax)
  }
  const [col, asc] = SORT_MAP[sort] || SORT_MAP['price-desc']
  query = query.order(dbCol(col), { ascending: asc })

  const { data, error } = await query
  if (error) throw error
  return data.map(toAppVehicle)
}

/** Todos los vehículos sin filtrar por estado (para el panel admin). */
export async function fetchAllVehicles() {
  if (!isSupabaseConfigured) return loadDemo()
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data.map(toAppVehicle)
}

export async function fetchVehicleById(id) {
  if (!isSupabaseConfigured) {
    return loadDemo().find((v) => v.id === id) || null
  }
  const { data, error } = await supabase.from('vehiculos').select('*').eq('id', id).single()
  if (error) throw error
  return toAppVehicle(data)
}

/* ---------------------------- mutaciones ----------------------------- */

export async function createVehicle(payload) {
  if (!isSupabaseConfigured) {
    const list = loadDemo()
    const vehicle = {
      id: uid(),
      status: 'disponible',
      is_new: false,
      images: [],
      created_at: new Date().toISOString(),
      ...payload,
      main_image_url: payload.main_image_url || payload.images?.[0] || null,
    }
    saveDemo([vehicle, ...list])
    return vehicle
  }
  const { data, error } = await supabase
    .from('vehiculos')
    .insert(toDbVehicle(payload))
    .select()
    .single()
  if (error) throw error
  return toAppVehicle(data)
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
    .from('vehiculos')
    .update(toDbVehicle(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return toAppVehicle(data)
}

export async function deleteVehicle(id) {
  if (!isSupabaseConfigured) {
    saveDemo(loadDemo().filter((v) => v.id !== id))
    return { id }
  }
  const { error } = await supabase.from('vehiculos').delete().eq('id', id)
  if (error) throw error
  return { id }
}
