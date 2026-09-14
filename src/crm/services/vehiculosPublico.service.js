import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

/** Solo columnas públicas: nunca las privadas de crm.vehiculos (dueño, ITV,
 *  patente, nota, consignación, carpetas, IVA). */
const COLUMNAS_PUBLICAS = `id, marca, modelo, version, color, anio, moneda, precio_contado,
  precio_usd, km, combustible, transmision, categoria, es_nuevo, descripcion, estado,
  creado_en, vehiculo_fotos ( url, es_portada, orden )`

const SORT_MAP = {
  'price-desc': ['precio_usd', false],
  'price-asc': ['precio_usd', true],
  'year-desc': ['anio', false],
  'km-asc': ['km', true],
}

/** Traduce una fila de crm.vehiculos (+ sus fotos) al shape en inglés que ya
 *  usa la UI pública (mismo que devolvía vehicles.service.js). */
function mapear(v) {
  const fotos = [...(v.vehiculo_fotos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const portada = fotos.find((f) => f.es_portada) ?? fotos[0]
  return {
    id: v.id,
    brand: v.marca,
    model: v.modelo,
    version: v.version,
    color: v.color,
    year: v.anio,
    currency: v.moneda,
    price_amount: v.precio_contado,
    price_usd: v.precio_usd,
    km: v.km,
    fuel_type: v.combustible,
    transmission: v.transmision,
    category: v.categoria,
    is_new: v.es_nuevo,
    status: v.estado,
    description: v.descripcion,
    main_image_url: portada?.url ?? null,
    images: fotos.map((f) => f.url),
    view_count: 0,
    created_at: v.creado_en,
  }
}

function aplicarFiltros(query, { search, filters }) {
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
  return query
}

export async function listarPublicos({
  category = 'todos',
  sort = 'price-desc',
  search = '',
  filters = null,
} = {}) {
  let query = db().from('vehiculos').select(COLUMNAS_PUBLICAS).eq('estado', 'disponible').eq('publicado', true)
  if (category !== 'todos') query = query.eq('categoria', category)
  query = aplicarFiltros(query, { search, filters })
  const [col, asc] = SORT_MAP[sort] || SORT_MAP['price-desc']
  query = query.order(col, { ascending: asc })

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapear)
}

/** Todos los vehículos (cualquier estado, publicados o no) para las
 *  estadísticas del panel — requiere sesión, no se usa desde la web pública. */
export async function listarTodos() {
  const { data, error } = await db()
    .from('vehiculos')
    .select(COLUMNAS_PUBLICAS)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapear)
}

export async function obtenerPublicoPorId(id) {
  const { data, error } = await db()
    .from('vehiculos')
    .select(COLUMNAS_PUBLICAS)
    .eq('id', id)
    .eq('estado', 'disponible')
    .eq('publicado', true)
    .maybeSingle()
  if (error) throw error
  return data ? mapear(data) : null
}
