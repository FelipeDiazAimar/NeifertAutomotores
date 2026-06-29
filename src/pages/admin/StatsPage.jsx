import { useState } from 'react'
import { Target, Users, Eye, TrendingUp, ArrowUpRight } from 'lucide-react'
import KpiCard from '@/components/crm/KpiCard'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import TrafficLineChart from '@/components/stats/TrafficLineChart'
import LeadsByChannelBar from '@/components/stats/LeadsByChannelBar'
import TopModelsList from '@/components/stats/TopModelsList'
import ClosingTrendChart from '@/components/stats/ClosingTrendChart'
import StatsDateFilter from '@/components/stats/StatsDateFilter'
import AllModelsModal from '@/components/stats/AllModelsModal'
import { useStats } from '@/hooks/useStats'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import { formatCompact } from '@/lib/formatters'

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-2">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-neifert" /> Web
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-ink" /> Salón
      </span>
    </div>
  )
}

export default function StatsPage() {
  useRealtimeLeads()
  const { data: stats, isLoading } = useStats()
  const [range, setRange] = useState({ from: null, to: null, label: 'Todo el período' })
  const [showAll, setShowAll] = useState(false)

  if (isLoading || !stats) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner size={32} />
      </div>
    )
  }

  const k = stats.kpis

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-neifert px-4 py-1.5 text-sm font-semibold text-white shadow-glow-red">
          Dashboard de Analítica
        </span>
        <StatsDateFilter value={range} onChange={setRange} />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Target}
          accent="red"
          label="Ventas Totales"
          value={k.ventasTotales.value}
          delta={k.ventasTotales.delta || null}
        />
        <KpiCard
          icon={Users}
          accent="blue"
          label="Nuevos Leads"
          value={k.nuevosLeads.value.toLocaleString('es-AR')}
          delta={k.nuevosLeads.delta || null}
        />
        <KpiCard
          icon={Eye}
          accent="green"
          label="Visitas Web"
          value={formatCompact(k.visitasWeb.value)}
          delta={k.visitasWeb.delta || null}
        />
        <KpiCard
          icon={TrendingUp}
          accent="amber"
          label="Tasa Conversión"
          value={`${k.tasaConversion.value}%`}
          delta={k.tasaConversion.delta || null}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard className="p-5">
          <CardHeader
            title="Tráfico Mensual"
            subtitle="Comparativa Web vs. Visitas Presenciales"
            right={<Legend />}
          />
          <TrafficLineChart data={stats.weeklyTraffic} />
        </GlassCard>

        <GlassCard className="p-5">
          <CardHeader title="Origen de Leads" subtitle="Distribución por canales de captación" />
          <LeadsByChannelBar data={stats.leadsByChannel} />
        </GlassCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard className="p-5">
          <CardHeader
            title="Modelos más Buscados"
            right={
              <button
                onClick={() => setShowAll(true)}
                className="flex items-center gap-1 text-xs font-semibold text-neifert"
              >
                Ver todo <ArrowUpRight size={13} />
              </button>
            }
          />
          <TopModelsList models={stats.topModels} />
        </GlassCard>

        <GlassCard className="p-5">
          <CardHeader title="Tendencia de Cierre" subtitle="Eficiencia comercial semanal" />
          <ClosingTrendChart data={stats.closingTrend} rate={stats.closingRate} />
        </GlassCard>
      </div>

      <AllModelsModal open={showAll} onClose={() => setShowAll(false)} range={range} />
    </div>
  )
}
