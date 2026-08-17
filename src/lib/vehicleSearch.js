import { VEHICLE_CATEGORIES } from './constants'

const DEFAULT_CAT_LABEL = Object.fromEntries(VEHICLE_CATEGORIES.map((c) => [c.id, c.label]))

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

const STOPWORDS = new Set([
  'de', 'la', 'el', 'un', 'una', 'con', 'para', 'que', 'los', 'las', 'del',
  'y', 'o', 'en', 'a', 'al', 'es', 'algo', 'auto', 'vehiculo', 'busco',
])

const tokenize = (text) =>
  norm(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))

/** Sinónimos / intención → conceptos reales del catálogo (categoría/atributo).
 *  Se usan tanto para el scoring por reglas como para expandir la query antes
 *  de compararla semánticamente (TF-IDF) contra cada vehículo. */
const INTENTS = [
  { words: ['barato', 'economico', 'accesible'], concepts: [], score: (v, ctx) => (v.price_usd <= ctx.priceMid ? 2 : 0) },
  { words: ['nuevo', '0km', 'okm', 'cero'], concepts: ['nuevo'], score: (v) => (v.km === 0 || v.is_new ? 2 : 0) },
  { words: ['usado'], concepts: [], score: (v) => (v.km > 0 ? 1 : 0) },
  { words: ['electrico', 'ev', 'enchufable'], concepts: ['electrico'], score: (v) => (v.fuel_type === 'Eléctrico' ? 3 : 0) },
  { words: ['hibrido'], concepts: ['hibrido'], score: (v) => (v.fuel_type === 'Híbrido' ? 3 : 0) },
  { words: ['nafta', 'gasolina'], concepts: ['nafta'], score: (v) => (v.fuel_type === 'Nafta' ? 2 : 0) },
  { words: ['diesel'], concepts: ['diesel'], score: (v) => (v.fuel_type === 'Diésel' ? 3 : 0) },
  { words: ['automatico', 'automatica'], concepts: [], score: (v) => (/autom/i.test(v.transmission || '') ? 1 : 0) },
  { words: ['manual'], concepts: [], score: (v) => (/manual/i.test(v.transmission || '') ? 2 : 0) },
  { words: ['familiar', 'familia', 'espacioso', 'grande'], concepts: ['suv', 'pickup'], score: (v) => (['suv', 'pickup'].includes(v.category) ? 2 : 0) },
  { words: ['deportivo', 'rapido', 'potente'], concepts: ['sport', 'coupe'], score: (v) => (['sport', 'coupe'].includes(v.category) ? 2 : 0) },
  { words: ['ciudad', 'chico', 'compacto'], concepts: ['hatchback', 'compacto'], score: (v) => (['hatchback', 'sedan'].includes(v.category) ? 1 : 0) },
  { words: ['camioneta'], concepts: ['pickup'], score: (v) => (v.category === 'pickup' ? 3 : 0) },
]

const STATUS_WORDS = { disponible: 'disponible', reservado: 'reservado', vendido: 'vendido' }

/** Distancia de edición acotada (early-exit) — solo nos importa saber si es
 *  <= maxDist, no el valor exacto, así que cortamos apenas la supera. */
function editDistanceWithin(a, b, maxDist) {
  if (Math.abs(a.length - b.length) > maxDist) return false
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = dp[i][0]
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
      rowMin = Math.min(rowMin, dp[i][j])
    }
    if (rowMin > maxDist) return false
  }
  return dp[a.length][b.length] <= maxDist
}

/** ¿Alguna palabra del texto matchea el token, tolerando 1 error de tipeo
 *  (typos: "audy" → "audi")? Solo para tokens de 4+ letras. */
function fuzzyIncludes(text, token) {
  if (token.length < 4) return false
  return text.split(/\s+/).some((w) => w.length >= 4 && editDistanceWithin(w, token, 1))
}

const NUM = '(\\d+(?:[.,]\\d{3})*)'
function parseAmount(str) {
  return Number(str.replace(/[.,]/g, ''))
}

const isYearLike = (n) => n >= 1950 && n <= 2099

/** Detecta rangos de precio en la query completa: "menos de 20000",
 *  "hasta 15000", "entre 10000 y 20000", "mas de 30000". El patrón "entre X
 *  y Y" se cede a parseYearRange cuando ambos números parecen años, para no
 *  confundir "entre 2020 y 2023" con un rango de precio. */
function parsePriceRange(qNorm) {
  let m = qNorm.match(new RegExp(`entre\\s+${NUM}\\s+y\\s+${NUM}`))
  if (m && !(isYearLike(parseAmount(m[1])) && isYearLike(parseAmount(m[2])))) {
    return { min: parseAmount(m[1]), max: parseAmount(m[2]) }
  }
  m = qNorm.match(new RegExp(`(?:menos de|hasta|maximo|max)\\s+${NUM}`))
  if (m) return { max: parseAmount(m[1]) }
  m = qNorm.match(new RegExp(`(?:mas de|desde|minimo|min)\\s+${NUM}`))
  if (m) return { min: parseAmount(m[1]) }
  return null
}

/** Detecta rangos de año: "entre 2018 y 2022", "despues del 2020", "antes de 2019". */
function parseYearRange(qNorm) {
  let m = qNorm.match(/entre\s+(\d{4})\s+y\s+(\d{4})/)
  if (m) return { min: Number(m[1]), max: Number(m[2]) }
  m = qNorm.match(/despues (?:de|del)\s+(\d{4})/)
  if (m) return { min: Number(m[1]) }
  m = qNorm.match(/antes (?:de|del)\s+(\d{4})/)
  if (m) return { max: Number(m[1]) }
  return null
}

/** Texto base de cada vehículo, separado por relevancia: la marca/modelo
 *  pesa mucho más que la descripción a la hora de matchear palabras sueltas. */
function haystackParts(v, catLabel) {
  const primary = norm([v.brand, v.model].filter(Boolean).join(' '))
  const secondary = norm(
    [v.fuel_type, v.transmission, v.engine, v.category, catLabel[v.category], v.year, STATUS_WORDS[v.status] || v.status, v.is_new ? 'nuevo' : '']
      .filter((x) => x !== null && x !== undefined && x !== '')
      .join(' ')
  )
  const tertiary = norm(v.description || '')
  return { primary, secondary, tertiary, all: `${primary} ${secondary} ${tertiary}`.trim() }
}

/** Vector TF-IDF de un documento ya tokenizado. */
function tfidfVector(tokens, idf) {
  const tf = new Map()
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
  const vec = new Map()
  for (const [t, count] of tf) vec.set(t, (count / tokens.length) * (idf.get(t) || 0))
  return vec
}

function cosineSim(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [t, w] of a) {
    normA += w * w
    if (b.has(t)) dot += w * b.get(t)
  }
  for (const w of b.values()) normB += w * w
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Recibe la query, los vehículos y (opcional) las categorías del store para
 *  entender también las categorías nuevas por nombre. Combina matching
 *  exacto/difuso por palabra, reglas de intención, rangos numéricos y
 *  similitud semántica (TF-IDF + coseno) para rankear. */
export function searchVehicles(query, vehicles = [], categories = null) {
  const qNorm = norm(query).trim()
  if (!qNorm) return []
  const tokens = qNorm.split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t))
  if (!tokens.length) return []

  const catLabel =
    categories && categories.length
      ? Object.fromEntries(categories.map((c) => [c.id, c.label]))
      : DEFAULT_CAT_LABEL

  const priceRange = parsePriceRange(qNorm)
  const yearRange = parseYearRange(qNorm)

  let pool = vehicles
  if (priceRange) {
    pool = pool.filter(
      (v) => (priceRange.min == null || v.price_usd >= priceRange.min) && (priceRange.max == null || v.price_usd <= priceRange.max)
    )
  }
  if (yearRange) {
    pool = pool.filter(
      (v) => (yearRange.min == null || Number(v.year) >= yearRange.min) && (yearRange.max == null || Number(v.year) <= yearRange.max)
    )
  }

  const prices = vehicles.map((v) => v.price_usd).sort((a, b) => a - b)
  const priceMid = prices[Math.floor(prices.length / 2)] || 0
  const ctx = { priceMid }

  // --- Capa semántica: TF-IDF sobre todo el pool + coseno contra la query ---
  const docs = pool.map((v) => haystackParts(v, catLabel))
  const docTokens = docs.map((d) => tokenize(d.all))
  const df = new Map()
  for (const tokensDoc of docTokens) {
    for (const t of new Set(tokensDoc)) df.set(t, (df.get(t) || 0) + 1)
  }
  const idf = new Map()
  for (const [t, count] of df) idf.set(t, Math.log((docTokens.length + 1) / (count + 1)) + 1)
  const docVectors = docTokens.map((tokensDoc) => tfidfVector(tokensDoc, idf))

  const expandedQueryTokens = [...tokens]
  for (const intent of INTENTS) {
    if (intent.words.some((w) => tokens.includes(norm(w)))) expandedQueryTokens.push(...intent.concepts)
  }
  const queryVector = tfidfVector(expandedQueryTokens.filter((t) => !STOPWORDS.has(t)), idf)

  const scored = pool.map((v, i) => {
    const { primary, secondary, tertiary } = docs[i]
    let score = 0
    for (const t of tokens) {
      if (primary.includes(t)) score += 6
      else if (secondary.includes(t)) score += 3
      else if (tertiary.includes(t)) score += 1
      else if (fuzzyIncludes(primary, t) || fuzzyIncludes(secondary, t)) score += 3
      if (/^\d{4}$/.test(t) && String(v.year) === t) score += 4
    }
    for (const intent of INTENTS) {
      if (intent.words.some((w) => tokens.includes(norm(w)))) score += intent.score(v, ctx)
    }
    if (priceRange || yearRange) score += 2 // ya pasó el filtro duro, es una coincidencia fuerte

    const semanticScore = cosineSim(queryVector, docVectors[i]) * 6
    score += semanticScore

    return { v, score }
  })

  return scored
    .filter((s) => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.v)
}
