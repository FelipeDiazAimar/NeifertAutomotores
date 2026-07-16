import { supabase, isSupabaseConfigured } from './supabaseClient'
import { SOURCES } from '@/lib/provenance'

/** Registra un evento real (vista/consulta/venta) en public.eventos_vehiculo.
 *  `vehiculoId` es null para eventos generales (fab de WhatsApp, turnos, etc,
 *  no atados a un auto puntual). No-op en modo demo. */
export async function trackEvent(vehiculoId, tipo, origen = 'Directo') {
  if (!isSupabaseConfigured) return
  const { error } = await supabase
    .from('eventos_vehiculo')
    .insert({ vehiculo_id: vehiculoId || null, tipo, origen })
  if (error) console.error('[eventos_vehiculo] insert falló:', error.message)
}

const EMPTY_COUNTS = { views: 0, conversions: 0, sales: 0 }
const KEY_BY_TIPO = { vista: 'views', consulta: 'conversions', venta: 'sales' }
const DAY = 86_400_000

/** Serie diaria de vistas/consultas → [{ label, ts, views, conversions }].
 *  Sin rango explícito, usa los últimos 30 días (igual que el mock anterior). */
function buildDailySeries(events, { from, to }) {
  const end = to ?? Date.now()
  const start = from ?? end - 29 * DAY
  const dayCount = Math.max(1, Math.round((end - start) / DAY) + 1)
  const buckets = Array.from({ length: dayCount }, (_, i) => ({
    ts: start + i * DAY,
    views: 0,
    conversions: 0,
  }))
  const idxOf = (ts) => Math.floor((ts - start) / DAY)
  for (const e of events) {
    const key = e.tipo === 'vista' ? 'views' : e.tipo === 'consulta' ? 'conversions' : null
    if (!key) continue
    const i = idxOf(new Date(e.creado_en).getTime())
    if (i >= 0 && i < buckets.length) buckets[i][key] += 1
  }
  const fmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
  return buckets.map((b) => ({ ...b, label: fmt.format(new Date(b.ts)) }))
}

/** Serie diaria de compartidos vs. visitas por link compartido →
 *  [{ label, ts, shares, visits }]. Mismo criterio de ventana que la de
 *  arriba. */
function buildShareSeries(events, { from, to }) {
  const end = to ?? Date.now()
  const start = from ?? end - 29 * DAY
  const dayCount = Math.max(1, Math.round((end - start) / DAY) + 1)
  const buckets = Array.from({ length: dayCount }, (_, i) => ({
    ts: start + i * DAY,
    shares: 0,
    visits: 0,
  }))
  const idxOf = (ts) => Math.floor((ts - start) / DAY)
  for (const e of events) {
    const isShare = e.tipo === 'compartir'
    const isShareVisit = e.tipo === 'vista' && (e.origen || 'Directo') === 'Compartido'
    if (!isShare && !isShareVisit) continue
    const i = idxOf(new Date(e.creado_en).getTime())
    if (i < 0 || i >= buckets.length) continue
    if (isShare) buckets[i].shares += 1
    else buckets[i].visits += 1
  }
  const fmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
  return buckets.map((b) => ({ ...b, label: fmt.format(new Date(b.ts)) }))
}

/** Trae todos los eventos reales del rango y los agrega en un solo viaje:
 *  totales globales + desglose por vehículo + serie diaria + procedencia
 *  (global y por vehículo, solo de vistas) + compartir→ingresos. Devuelve
 *  null en modo demo. */
export async function fetchEventBreakdown({ from = null, to = null } = {}) {
  if (!isSupabaseConfigured) return null

  let query = supabase.from('eventos_vehiculo').select('vehiculo_id, tipo, origen, creado_en')
  if (from) query = query.gte('creado_en', new Date(from).toISOString())
  if (to) query = query.lte('creado_en', new Date(to).toISOString())

  const { data, error } = await query
  if (error) {
    console.error('[eventos_vehiculo] fetchEventBreakdown falló:', error.message)
    return {
      totals: { ...EMPTY_COUNTS },
      byVehicle: {},
      series: [],
      bySource: [],
      sourceByVehicle: {},
      shareStats: { shares: 0, visits: 0, rate: 0, byKind: { vehicle: 0, catalog: 0 } },
      shareSeries: [],
    }
  }

  const totals = { ...EMPTY_COUNTS }
  const byVehicle = {}
  const sourceCounts = Object.fromEntries(SOURCES.map((s) => [s, 0]))
  const sourceByVehicle = {}
  const shareStats = { shares: 0, visits: 0, byKind: { vehicle: 0, catalog: 0 } }

  for (const e of data) {
    const key = KEY_BY_TIPO[e.tipo]
    if (key) {
      totals[key] += 1
      if (e.vehiculo_id) {
        byVehicle[e.vehiculo_id] ??= { ...EMPTY_COUNTS }
        byVehicle[e.vehiculo_id][key] += 1
      }
      if (e.tipo === 'vista') {
        const source = e.origen || 'Directo'
        sourceCounts[source] = (sourceCounts[source] || 0) + 1
        if (e.vehiculo_id) {
          sourceByVehicle[e.vehiculo_id] ??= { total: 0 }
          sourceByVehicle[e.vehiculo_id][source] = (sourceByVehicle[e.vehiculo_id][source] || 0) + 1
          sourceByVehicle[e.vehiculo_id].total += 1
        }
        if (source === 'Compartido') shareStats.visits += 1
      }
    } else if (e.tipo === 'compartir') {
      shareStats.shares += 1
      shareStats.byKind[e.vehiculo_id ? 'vehicle' : 'catalog'] += 1
    }
  }
  shareStats.rate = shareStats.shares > 0 ? (shareStats.visits / shareStats.shares) * 100 : 0

  const bySource = SOURCES.map((source) => ({ source, value: sourceCounts[source] })).filter(
    (r) => r.value > 0
  )
  const series = buildDailySeries(data, { from, to })
  const shareSeries = buildShareSeries(data, { from, to })
  return { totals, byVehicle, series, bySource, sourceByVehicle, shareStats, shareSeries }
}
