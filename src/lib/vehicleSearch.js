import { VEHICLE_CATEGORIES } from './constants'

const DEFAULT_CAT_LABEL = Object.fromEntries(VEHICLE_CATEGORIES.map((c) => [c.id, c.label]))

/** Sinónimos / intención → función que puntúa un vehículo. */
const INTENTS = [
  { words: ['barato', 'economico', 'económico', 'accesible'], score: (v, ctx) => (v.price_usd <= ctx.priceMid ? 2 : 0) },
  { words: ['nuevo', '0km', 'okm', 'cero'], score: (v) => (v.km === 0 || v.is_new ? 2 : 0) },
  { words: ['usado', 'km'], score: (v) => (v.km > 0 ? 1 : 0) },
  { words: ['electrico', 'eléctrico', 'ev'], score: (v) => (v.fuel_type === 'Eléctrico' ? 3 : 0) },
  { words: ['hibrido', 'híbrido'], score: (v) => (v.fuel_type === 'Híbrido' ? 3 : 0) },
  { words: ['nafta', 'gasolina'], score: (v) => (v.fuel_type === 'Nafta' ? 2 : 0) },
  { words: ['diesel', 'diésel'], score: (v) => (v.fuel_type === 'Diésel' ? 3 : 0) },
  { words: ['automatico', 'automático', 'automatica', 'automática'], score: (v) => (/autom/i.test(v.transmission || '') ? 1 : 0) },
  { words: ['manual'], score: (v) => (/manual/i.test(v.transmission || '') ? 2 : 0) },
  { words: ['familiar', 'familia', 'espacioso'], score: (v) => (['suv', 'pickup'].includes(v.category) ? 2 : 0) },
  { words: ['deportivo', 'rapido', 'rápido', 'potente'], score: (v) => (['sport', 'coupe'].includes(v.category) ? 2 : 0) },
]

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

const STATUS_WORDS = { disponible: 'disponible', reservado: 'reservado', vendido: 'vendido' }

/** Texto base de cada vehículo para matchear palabras sueltas: incluye todos
 *  los detalles cargados (marca, modelo, categoría, motor, descripción, etc.). */
function haystack(v, catLabel) {
  return norm(
    [
      v.brand,
      v.model,
      v.fuel_type,
      v.transmission,
      v.engine,
      v.category,
      catLabel[v.category],
      v.year,
      v.price_usd,
      v.km,
      v.description,
      STATUS_WORDS[v.status] || v.status,
      v.is_new ? 'nuevo' : '',
    ]
      .filter((x) => x !== null && x !== undefined && x !== '')
      .join(' ')
  )
}

/** Recibe la query, los vehículos y (opcional) las categorías del store para
 *  entender también las categorías nuevas por nombre. Devuelve los más
 *  relacionados (score desc). */
export function searchVehicles(query, vehicles = [], categories = null) {
  const q = norm(query).trim()
  if (!q) return []
  const tokens = q.split(/\s+/).filter((t) => t.length > 1)
  if (!tokens.length) return []

  const catLabel =
    categories && categories.length
      ? Object.fromEntries(categories.map((c) => [c.id, c.label]))
      : DEFAULT_CAT_LABEL

  const prices = vehicles.map((v) => v.price_usd).sort((a, b) => a - b)
  const priceMid = prices[Math.floor(prices.length / 2)] || 0
  const ctx = { priceMid }

  const scored = vehicles.map((v) => {
    const hay = haystack(v, catLabel)
    let score = 0
    for (const t of tokens) {
      if (hay.includes(t)) score += 3
      if (/^\d{4}$/.test(t) && String(v.year) === t) score += 4
    }
    for (const intent of INTENTS) {
      if (intent.words.some((w) => tokens.includes(norm(w)))) score += intent.score(v, ctx)
    }
    return { v, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.v)
}
