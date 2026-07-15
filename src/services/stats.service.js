import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_STATS } from '@/lib/mockData'

export async function fetchStats() {
  if (!isSupabaseConfigured) return MOCK_STATS

  const [kpiRes, trafficRes, channelRes, modelsRes] = await Promise.all([
    supabase.from('v_resumen_kpi').select('*').single(),
    supabase.from('v_trafico_semanal').select('*'),
    supabase.from('v_prospectos_por_canal').select('*'),
    supabase.from('v_modelos_top').select('*'),
  ])

  const k = kpiRes.data || {}
  const weeklyTraffic = (trafficRes.data || [])
    .slice()
    .reverse()
    .map((r) => ({ day: r.dia, web: r.web, showroom: r.salon }))
  const leadsByChannel = (channelRes.data || []).map((r) => ({
    channel: r.canal,
    value: r.valor,
  }))
  const topModels = (modelsRes.data || []).slice(0, 3).map((r) => ({
    rank: r.posicion,
    name: r.nombre,
    sub: '',
    interest: r.interes,
    sold: 0,
    delta: 0,
  }))

  return {
    kpis: {
      ventasTotales: { value: k.ventas_totales ?? 0, delta: 0 },
      nuevosLeads: { value: k.nuevos_prospectos ?? 0, delta: 0 },
      visitasWeb: { value: k.visitas_web ?? 0, delta: 0 },
      tasaConversion: { value: k.tasa_conversion ?? 0, delta: 0 },
    },
    weeklyTraffic,
    leadsByChannel,
    topModels,
    closingTrend: MOCK_STATS.closingTrend,
    closingRate: { value: k.tasa_conversion ?? 0, delta: 0 },
  }
}
