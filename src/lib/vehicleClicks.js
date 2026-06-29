import { MOCK_VEHICLES } from './mockData'

/**
 * Registro de vistas y conversiones por vehículo (demo → localStorage).
 * Con Supabase esto sería una tabla `vehicle_events` global.
 *
 * Tipos de evento:
 *   view       → usuario abrió la página de detalle del vehículo
 *   conversion → usuario tocó "Consultar por WhatsApp" en el detalle
 */

const VIEWS_KEY = 'nf-vehicle-clicks'       // nombre original, vistas de detalle
const CONV_KEY  = 'nf-vehicle-conversions'  // clicks en botón WhatsApp

function readKey(key) {
  if (typeof localStorage === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
}

function writeKey(key, events) {
  localStorage.setItem(key, JSON.stringify(events))
}

/** Genera datos de muestra la primera vez para que el panel no esté vacío. */
function seedIfEmpty() {
  if (readKey(VIEWS_KEY).length) return
  const now = Date.now()
  const day = 86_400_000
  const views = []
  const convs = []
  MOCK_VEHICLES.forEach((v, i) => {
    const base = Math.max(60 - i * 4 + Math.floor(Math.random() * 12), 5)
    for (let n = 0; n < base; n++) {
      views.push({ id: v.id, ts: now - Math.floor(Math.random() * 90) * day })
    }
    // Tasa de conversión simulada ~15-30%
    const convCount = Math.floor(base * (0.15 + Math.random() * 0.15))
    for (let n = 0; n < convCount; n++) {
      convs.push({ id: v.id, ts: now - Math.floor(Math.random() * 90) * day })
    }
  })
  writeKey(VIEWS_KEY, views)
  writeKey(CONV_KEY, convs)
}

/** Registra una vista al detalle de un vehículo. */
export function trackVehicleClick(id) {
  if (!id) return
  seedIfEmpty()
  const events = readKey(VIEWS_KEY)
  events.push({ id, ts: Date.now() })
  writeKey(VIEWS_KEY, events)
}

/** Registra una conversión (click en WhatsApp desde el detalle). */
export function trackVehicleConversion(id) {
  if (!id) return
  seedIfEmpty()
  const events = readKey(CONV_KEY)
  events.push({ id, ts: Date.now() })
  writeKey(CONV_KEY, events)
}

/** Devuelve eventos de vista crudos. */
export function getClickEvents() {
  seedIfEmpty()
  return readKey(VIEWS_KEY)
}

/** Cuenta vistas por vehículo en un rango opcional {from, to} (ms). */
export function aggregateClicks({ from = null, to = null } = {}) {
  const counts = {}
  for (const e of getClickEvents()) {
    if (from != null && e.ts < from) continue
    if (to != null && e.ts > to) continue
    counts[e.id] = (counts[e.id] || 0) + 1
  }
  return counts
}

/**
 * Devuelve un mapa { [vehicleId]: { views, conversions, rate } }
 * para mostrar en el panel de administración.
 */
export function aggregateStats({ from = null, to = null } = {}) {
  seedIfEmpty()
  const viewMap = {}
  const convMap = {}

  for (const e of readKey(VIEWS_KEY)) {
    if (from != null && e.ts < from) continue
    if (to != null && e.ts > to) continue
    viewMap[e.id] = (viewMap[e.id] || 0) + 1
  }
  for (const e of readKey(CONV_KEY)) {
    if (from != null && e.ts < from) continue
    if (to != null && e.ts > to) continue
    convMap[e.id] = (convMap[e.id] || 0) + 1
  }

  const allIds = new Set([...Object.keys(viewMap), ...Object.keys(convMap)])
  const result = {}
  for (const id of allIds) {
    const views = viewMap[id] || 0
    const conversions = convMap[id] || 0
    result[id] = { views, conversions, rate: views > 0 ? (conversions / views) * 100 : 0 }
  }
  return result
}
