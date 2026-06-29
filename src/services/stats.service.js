import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_STATS } from '@/lib/mockData'

export async function fetchStats() {
  if (!isSupabaseConfigured) return MOCK_STATS

  const [kpiRes, trafficRes, channelRes, modelsRes] = await Promise.all([
    supabase.from('v_kpi_summary').select('*').single(),
    supabase.from('v_weekly_traffic').select('*'),
    supabase.from('v_leads_by_channel').select('*'),
    supabase.from('v_top_models').select('*'),
  ])

  const k = kpiRes.data || {}
  const weeklyTraffic = (trafficRes.data || [])
    .slice()
    .reverse()
    .map((r) => ({ day: r.day, web: r.web, showroom: r.showroom }))
  const leadsByChannel = (channelRes.data || []).map((r) => ({
    channel: r.channel,
    value: r.value,
  }))
  const topModels = (modelsRes.data || []).slice(0, 3).map((r) => ({
    rank: r.rank,
    name: r.name,
    sub: '',
    interest: r.interest,
    sold: 0,
    delta: 0,
  }))

  return {
    kpis: {
      ventasTotales: { value: k.ventas_totales ?? 0, delta: 0 },
      nuevosLeads: { value: k.nuevos_leads ?? 0, delta: 0 },
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
