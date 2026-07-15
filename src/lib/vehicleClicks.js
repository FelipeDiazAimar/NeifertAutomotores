import { MOCK_VEHICLES } from './mockData'
import { SOURCES } from './provenance'

/**
 * Registro de vistas, consultas y ventas por vehículo (demo → localStorage).
 * Con Supabase esto sería una tabla `vehicle_events` global.
 *
 * Cada evento guarda { id, ts, source } donde source ∈ SOURCES (procedencia).
 * Tipos:
 *   view       → abrió el detalle del vehículo
 *   conversion → tocó "Consultar por WhatsApp"
 *   sale       → se registró una venta (demo: sembrado)
 */

const VIEWS_KEY = 'nf-vehicle-views-v2'
const CONV_KEY = 'nf-vehicle-conv-v2'
const SALES_KEY = 'nf-vehicle-sales-v2'
const SHARE_KEY = 'nf-share-clicks-v2' // toques en botones de compartir
const SHARE_VISIT_KEY = 'nf-share-visits-v2' // ingresos por link compartido (?ref=share)

const DAY = 86_400_000

function readKey(key) {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(key)) || []
  } catch {
    return []
  }
}

function writeKey(key, events) {
  localStorage.setItem(key, JSON.stringify(events))
}

/** Elige una procedencia al azar con pesos realistas (para el seed demo). */
function weightedSource() {
  const weights = [
    ['Web', 0.34],
    ['Instagram', 0.26],
    ['WhatsApp', 0.18],
    ['Facebook', 0.12],
    ['Directo', 0.10],
  ]
  let r = Math.random()
  for (const [src, w] of weights) {
    if (r < w) return src
    r -= w
  }
  return 'Web'
}

/** Genera datos de muestra la primera vez para que el panel no esté vacío. */
function seedIfEmpty() {
  const now = Date.now()

  if (!readKey(VIEWS_KEY).length) {
    const views = []
    const convs = []
    const sales = []
    MOCK_VEHICLES.forEach((v, i) => {
      const base = Math.max(60 - i * 4 + Math.floor(Math.random() * 12), 8)
      for (let n = 0; n < base; n++) {
        views.push({ id: v.id, ts: now - Math.floor(Math.random() * 60) * DAY, source: weightedSource() })
      }
      const convCount = Math.floor(base * (0.15 + Math.random() * 0.15))
      for (let n = 0; n < convCount; n++) {
        convs.push({ id: v.id, ts: now - Math.floor(Math.random() * 60) * DAY, source: weightedSource() })
      }
      const saleCount = Math.floor(convCount * (0.25 + Math.random() * 0.25))
      for (let n = 0; n < saleCount; n++) {
        sales.push({ id: v.id, ts: now - Math.floor(Math.random() * 60) * DAY, source: weightedSource() })
      }
    })
    writeKey(VIEWS_KEY, views)
    writeKey(CONV_KEY, convs)
    writeKey(SALES_KEY, sales)
  }

  if (!readKey(SHARE_KEY).length) {
    const shares = []
    const visits = []
    const totalShares = 45 + Math.floor(Math.random() * 30)
    for (let n = 0; n < totalShares; n++) {
      shares.push({
        ts: now - Math.floor(Math.random() * 60) * DAY,
        kind: Math.random() < 0.72 ? 'vehicle' : 'catalog',
        source: weightedSource(),
      })
    }
    // Los ingresos por link compartido son ~45-70% de los compartidos.
    const totalVisits = Math.floor(totalShares * (0.45 + Math.random() * 0.25))
    for (let n = 0; n < totalVisits; n++) {
      visits.push({ ts: now - Math.floor(Math.random() * 60) * DAY })
    }
    writeKey(SHARE_KEY, shares)
    writeKey(SHARE_VISIT_KEY, visits)
  }
}

function pushEvent(key, id, source) {
  if (!id) return
  seedIfEmpty()
  const events = readKey(key)
  events.push({ id, ts: Date.now(), source: source || 'Directo' })
  writeKey(key, events)
}

/** Registra una vista al detalle de un vehículo (con procedencia). */
export function trackVehicleClick(id, source) {
  pushEvent(VIEWS_KEY, id, source)
}

/** Registra una consulta (click en WhatsApp desde el detalle). */
export function trackVehicleConversion(id, source) {
  pushEvent(CONV_KEY, id, source)
}

/** Registra una venta (para integración real; demo lo siembra). */
export function trackVehicleSale(id, source) {
  pushEvent(SALES_KEY, id, source)
}

/** Registra un toque en un botón de compartir. kind: 'vehicle' | 'catalog'. */
export function trackShareClick({ kind = 'vehicle', id = null, source = null } = {}) {
  seedIfEmpty()
  const events = readKey(SHARE_KEY)
  events.push({ ts: Date.now(), kind, id, source })
  writeKey(SHARE_KEY, events)
}

/** Registra un ingreso proveniente de un link compartido (?ref=share). */
export function recordShareVisit(path) {
  seedIfEmpty()
  const events = readKey(SHARE_VISIT_KEY)
  events.push({
    ts: Date.now(),
    path: path || (typeof location !== 'undefined' ? location.pathname : ''),
  })
  writeKey(SHARE_VISIT_KEY, events)
}

/* --------------------------- helpers de rango --------------------------- */

function inRange(e, from, to) {
  if (from != null && e.ts < from) return false
  if (to != null && e.ts > to) return false
  return true
}

function filtered(key, from, to) {
  return readKey(key).filter((e) => inRange(e, from, to))
}

/* ---------------------------- agregaciones ----------------------------- */

/** Vistas por vehículo en un rango (compat con código previo). */
export function aggregateClicks({ from = null, to = null } = {}) {
  seedIfEmpty()
  const counts = {}
  for (const e of filtered(VIEWS_KEY, from, to)) counts[e.id] = (counts[e.id] || 0) + 1
  return counts
}

/** { [vehicleId]: { views, conversions, sales, rate } } */
export function aggregateStats({ from = null, to = null } = {}) {
  seedIfEmpty()
  const views = {}
  const conv = {}
  const sales = {}
  for (const e of filtered(VIEWS_KEY, from, to)) views[e.id] = (views[e.id] || 0) + 1
  for (const e of filtered(CONV_KEY, from, to)) conv[e.id] = (conv[e.id] || 0) + 1
  for (const e of filtered(SALES_KEY, from, to)) sales[e.id] = (sales[e.id] || 0) + 1

  const ids = new Set([...Object.keys(views), ...Object.keys(conv), ...Object.keys(sales)])
  const result = {}
  for (const id of ids) {
    const v = views[id] || 0
    const c = conv[id] || 0
    result[id] = { views: v, conversions: c, sales: sales[id] || 0, rate: v > 0 ? (c / v) * 100 : 0 }
  }
  return result
}

/** Totales de vistas por procedencia → [{ source, value }]. */
export function aggregateBySource({ from = null, to = null } = {}) {
  seedIfEmpty()
  const counts = Object.fromEntries(SOURCES.map((s) => [s, 0]))
  for (const e of filtered(VIEWS_KEY, from, to)) {
    const s = e.source || 'Directo'
    counts[s] = (counts[s] || 0) + 1
  }
  return SOURCES.map((source) => ({ source, value: counts[source] })).filter((r) => r.value > 0)
}

/** Vistas por procedencia desglosadas por vehículo → { [id]: {Instagram, …, total} } */
export function aggregateSourceByVehicleId({ from = null, to = null } = {}) {
  seedIfEmpty()
  const map = {}
  for (const e of filtered(VIEWS_KEY, from, to)) {
    const s = e.source || 'Directo'
    if (!map[e.id]) map[e.id] = { total: 0 }
    map[e.id][s] = (map[e.id][s] || 0) + 1
    map[e.id].total += 1
  }
  return map
}

/** Embudo por vehículo → { [id]: { views, conversions, sales } } */
export function funnelByVehicleId({ from = null, to = null } = {}) {
  const stats = aggregateStats({ from, to })
  const out = {}
  for (const [id, s] of Object.entries(stats)) {
    out[id] = { views: s.views, conversions: s.conversions, sales: s.sales }
  }
  return out
}

/** Serie temporal de vistas y consultas por día → [{ label, ts, views, conversions }] */
export function timeSeries({ from = null, to = null, days = 30 } = {}) {
  seedIfEmpty()
  const end = to ?? Date.now()
  const start = from ?? end - (days - 1) * DAY
  const buckets = []
  const dayCount = Math.max(1, Math.round((end - start) / DAY) + 1)
  for (let i = 0; i < dayCount; i++) {
    const dayStart = start + i * DAY
    buckets.push({ ts: dayStart, views: 0, conversions: 0 })
  }
  const idxOf = (ts) => Math.floor((ts - start) / DAY)
  for (const e of readKey(VIEWS_KEY)) {
    const i = idxOf(e.ts)
    if (i >= 0 && i < buckets.length) buckets[i].views += 1
  }
  for (const e of readKey(CONV_KEY)) {
    const i = idxOf(e.ts)
    if (i >= 0 && i < buckets.length) buckets[i].conversions += 1
  }
  const fmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
  return buckets.map((b) => ({ ...b, label: fmt.format(new Date(b.ts)) }))
}

/** Conversión de compartir: toques en compartir vs. ingresos por link. */
export function shareTotals({ from = null, to = null } = {}) {
  seedIfEmpty()
  const shares = filtered(SHARE_KEY, from, to).length
  const visits = filtered(SHARE_VISIT_KEY, from, to).length
  const byKind = { vehicle: 0, catalog: 0 }
  for (const e of filtered(SHARE_KEY, from, to)) byKind[e.kind] = (byKind[e.kind] || 0) + 1
  return { shares, visits, rate: shares > 0 ? (visits / shares) * 100 : 0, byKind }
}

/** Serie temporal de compartidos vs. ingresos → [{ label, ts, shares, visits }] */
export function shareTimeSeries({ from = null, to = null, days = 30 } = {}) {
  seedIfEmpty()
  const end = to ?? Date.now()
  const start = from ?? end - (days - 1) * DAY
  const dayCount = Math.max(1, Math.round((end - start) / DAY) + 1)
  const buckets = []
  for (let i = 0; i < dayCount; i++) buckets.push({ ts: start + i * DAY, shares: 0, visits: 0 })
  const idxOf = (ts) => Math.floor((ts - start) / DAY)
  for (const e of readKey(SHARE_KEY)) {
    const i = idxOf(e.ts)
    if (i >= 0 && i < buckets.length) buckets[i].shares += 1
  }
  for (const e of readKey(SHARE_VISIT_KEY)) {
    const i = idxOf(e.ts)
    if (i >= 0 && i < buckets.length) buckets[i].visits += 1
  }
  const fmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
  return buckets.map((b) => ({ ...b, label: fmt.format(new Date(b.ts)) }))
}

/** Totales globales para KPIs. */
export function totals({ from = null, to = null } = {}) {
  seedIfEmpty()
  const views = filtered(VIEWS_KEY, from, to).length
  const conversions = filtered(CONV_KEY, from, to).length
  const sales = filtered(SALES_KEY, from, to).length
  const bySource = aggregateBySource({ from, to })
  const topSource = bySource.slice().sort((a, b) => b.value - a.value)[0]?.source || '—'
  return {
    views,
    conversions,
    sales,
    convRate: views > 0 ? (conversions / views) * 100 : 0,
    topSource,
  }
}
