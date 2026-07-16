import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import { Eye, MessageCircle, TrendingUp, Radio, Share2, Expand } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import KpiCard from '@/components/crm/KpiCard'
import TopVehiclesModal from '@/components/stats/TopVehiclesModal'
import { fetchAllVehicles } from '@/services/vehicles.service'
import { SOURCES, SOURCE_COLORS } from '@/lib/provenance'
import {
  aggregateBySource,
  aggregateSourceByVehicleId,
  funnelByVehicleId,
  aggregateStats,
  timeSeries,
  totals,
  shareTotals,
  shareTimeSeries,
} from '@/lib/vehicleClicks'
import { useChartColors } from '@/hooks/useChartColors'
import { useEventStats } from '@/hooks/useEventStats'

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

const tooltipStyle = (c) => ({
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
  fontSize: 12,
  color: c.ink,
})

export default function VehicleAnalytics({ range = {} }) {
  const c = useChartColors()
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'analytics'],
    queryFn: fetchAllVehicles,
  })

  const nameById = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.id, `${v.brand} ${v.model}`])),
    [vehicles]
  )
  const shortName = (id) => nameById[id] || id

  const r = { from: range.from ?? null, to: range.to ?? null }
  const { data: real } = useEventStats(r)
  const realViews = real?.totals.views
  const realConversions = real?.totals.conversions
  const realSales = real?.totals.sales
  const realConvRate =
    real && real.totals.views > 0 ? (real.totals.conversions / real.totals.views) * 100 : null
  const bySource = useMemo(() => aggregateBySource(r), [r.from, r.to])
  const stats = useMemo(() => aggregateStats(r), [r.from, r.to])
  const srcByVeh = useMemo(() => aggregateSourceByVehicleId(r), [r.from, r.to])
  const funnelMap = useMemo(() => funnelByVehicleId(r), [r.from, r.to])
  const series = useMemo(() => timeSeries(r), [r.from, r.to])
  const tot = useMemo(() => totals(r), [r.from, r.to])
  const shareTot = useMemo(() => shareTotals(r), [r.from, r.to])
  const shareSeries = useMemo(() => shareTimeSeries(r), [r.from, r.to])

  const topIds = useMemo(
    () =>
      Object.entries(stats)
        .sort((a, b) => b[1].views - a[1].views)
        .slice(0, 6)
        .map(([id]) => id),
    [stats]
  )

  const stackedData = useMemo(
    () =>
      topIds.map((id) => {
        const row = { name: shortName(id) }
        const src = srcByVeh[id] || {}
        SOURCES.forEach((s) => (row[s] = src[s] || 0))
        return row
      }),
    [topIds, srcByVeh, nameById]
  )

  const topBarData = useMemo(
    () =>
      topIds.map((id) => ({
        name: shortName(id),
        vistas: stats[id].views,
        consultas: stats[id].conversions,
      })),
    [topIds, stats, nameById]
  )

  // "Top vehículos" y "Procedencia × vehículo" en base a eventos reales
  // (independiente de topIds/stackedData de arriba, que todavía usan datos
  // mock — no comparten vehiculo_id con el mock, así que se arma aparte).
  const realByVehicle = real?.byVehicle
  const realSourceByVehicle = real?.sourceByVehicle
  const realTopIds = useMemo(() => {
    if (!realByVehicle) return null
    return Object.entries(realByVehicle)
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 6)
      .map(([id]) => id)
  }, [realByVehicle])

  const realTopBarData = useMemo(() => {
    if (!realTopIds) return null
    return realTopIds.map((id) => ({
      name: shortName(id),
      vistas: realByVehicle[id].views,
      consultas: realByVehicle[id].conversions,
    }))
  }, [realTopIds, realByVehicle, nameById])

  const realStackedData = useMemo(() => {
    if (!realTopIds) return null
    return realTopIds.map((id) => {
      const row = { name: shortName(id) }
      const src = realSourceByVehicle?.[id] || {}
      SOURCES.forEach((s) => (row[s] = src[s] || 0))
      return row
    })
  }, [realTopIds, realSourceByVehicle, nameById])

  const topVehiclesData = realTopBarData ?? topBarData
  const stackedChartData = realStackedData ?? stackedData
  const bySourceData = real?.bySource ?? bySource
  const realTopSource = bySourceData.slice().sort((a, b) => b.value - a.value)[0]?.source || null
  const shareStatsData = real?.shareStats ?? shareTot
  const shareSeriesData = real?.shareSeries ?? shareSeries
  const allByVehicle = realByVehicle ?? stats
  const [showAllVehicles, setShowAllVehicles] = useState(false)

  const [selVeh, setSelVeh] = useState('all')
  const funnel =
    selVeh === 'all'
      ? {
          views: realViews ?? tot.views,
          conversions: realConversions ?? tot.conversions,
          sales: realSales ?? tot.sales,
        }
      : (real?.byVehicle[selVeh] ?? funnelMap[selVeh] ?? { views: 0, conversions: 0, sales: 0 })

  const stages = [
    { label: 'Vistas', value: funnel.views, color: '#BE1E2D' },
    { label: 'Consultas', value: funnel.conversions, color: '#E24B4A' },
    { label: 'Ventas', value: funnel.sales, color: '#10B981' },
  ]
  const funnelMax = funnel.views || 1

  return (
    <div className="space-y-6">
      {/* KPIs reales de vistas/consultas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Eye}
          accent="red"
          label="Vistas totales"
          value={(realViews ?? tot.views).toLocaleString('es-AR')}
        />
        <KpiCard
          icon={MessageCircle}
          accent="green"
          label="Consultas"
          value={(realConversions ?? tot.conversions).toLocaleString('es-AR')}
        />
        <KpiCard
          icon={TrendingUp}
          accent="amber"
          label="Tasa de conversión"
          value={`${(realConvRate ?? tot.convRate).toFixed(1)}%`}
        />
        <KpiCard icon={Radio} accent="blue" label="Canal top" value={realTopSource || tot.topSource} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Dona: vistas por procedencia */}
        <GlassCard className="p-5">
          <CardHeader title="Vistas por procedencia" subtitle="De dónde llegan las visitas" />
          {bySourceData.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-3">Sin datos en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={bySourceData}
                  dataKey="value"
                  nameKey="source"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                >
                  {bySourceData.map((e) => (
                    <Cell key={e.source} fill={SOURCE_COLORS[e.source]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle(c)} />
                <Legend
                  iconType="circle"
                  formatter={(val) => <span style={{ color: c.inkSoft, fontSize: 12 }}>{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        {/* 2. Barras apiladas: procedencia × vehículo */}
        <GlassCard className="p-5">
          <CardHeader title="Procedencia × vehículo" subtitle="Top vehículos y de qué canal vinieron" />
          {stackedChartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-3">Sin datos en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stackedChartData} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={c.muted}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={116}
                />
                <Tooltip cursor={{ fill: c.grid }} contentStyle={tooltipStyle(c)} />
                {SOURCES.map((s, i) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="a"
                    fill={SOURCE_COLORS[s]}
                    radius={i === SOURCES.length - 1 ? [0, 6, 6, 0] : 0}
                    barSize={16}
                  />
                ))}
                <Legend
                  iconType="circle"
                  formatter={(val) => <span style={{ color: c.inkSoft, fontSize: 11 }}>{val}</span>}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 3. Embudo vistas→consulta→venta */}
        <GlassCard className="p-5">
          <CardHeader
            title="Embudo de conversión"
            subtitle="Vistas → consultas → ventas"
            right={
              <select
                value={selVeh}
                onChange={(e) => setSelVeh(e.target.value)}
                className="rounded-lg border border-line bg-transparent px-2 py-1 text-xs text-ink-2 outline-none"
              >
                <option value="all">Todos</option>
                {topIds.map((id) => (
                  <option key={id} value={id}>
                    {shortName(id)}
                  </option>
                ))}
              </select>
            }
          />
          <div className="space-y-4 py-2">
            {stages.map((s, i) => {
              const prev = i === 0 ? null : stages[i - 1].value
              const stepRate = prev ? (prev > 0 ? (s.value / prev) * 100 : 0) : null
              return (
                <div key={s.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{s.label}</span>
                    <span className="font-bold text-ink">
                      {s.value.toLocaleString('es-AR')}
                      {stepRate != null && (
                        <span className="ml-2 text-xs font-normal text-ink-3">
                          {stepRate.toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-8 overflow-hidden rounded-lg bg-surface">
                    <div
                      className="h-full rounded-lg transition-all duration-500"
                      style={{
                        width: `${Math.max(5, (s.value / funnelMax) * 100)}%`,
                        background: s.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>

        {/* 4a. Top vehículos: vistas vs consultas */}
        <GlassCard className="p-5">
          <CardHeader
            title="Top vehículos"
            subtitle="Vistas vs. consultas por unidad"
            right={
              <button
                onClick={() => setShowAllVehicles(true)}
                className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:text-neifert"
              >
                <Expand size={13} /> Ver todos
              </button>
            }
          />
          {topVehiclesData.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-3">Sin datos en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topVehiclesData} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={c.muted}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={116}
                />
                <Tooltip cursor={{ fill: c.grid }} contentStyle={tooltipStyle(c)} />
                <Bar dataKey="vistas" fill={c.red} radius={[0, 6, 6, 0]} barSize={9} />
                <Bar dataKey="consultas" fill="#10B981" radius={[0, 6, 6, 0]} barSize={9} />
                <Legend
                  iconType="circle"
                  formatter={(val) => <span style={{ color: c.inkSoft, fontSize: 11 }}>{val}</span>}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      {/* 4b. Serie temporal */}
      <GlassCard className="p-5">
        <CardHeader title="Vistas y consultas en el tiempo" subtitle="Evolución diaria" />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={real?.series ?? series} margin={{ left: -12, right: 12, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="label" stroke={c.muted} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis stroke={c.muted} fontSize={11} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={tooltipStyle(c)} />
            <Line type="monotone" dataKey="views" name="Vistas" stroke={c.red} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="conversions" name="Consultas" stroke="#10B981" strokeWidth={2.5} dot={false} />
            <Legend
              iconType="circle"
              formatter={(val) => <span style={{ color: c.inkSoft, fontSize: 11 }}>{val}</span>}
            />
          </LineChart>
        </ResponsiveContainer>
      </GlassCard>

      {/* Conversión de compartir: toques en compartir → ingresos por link */}
      <GlassCard className="p-5">
        <CardHeader
          title="Compartir → Ingresos"
          subtitle="Toques en compartir vs. visitas que llegaron por un link compartido"
          right={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neifert/10 px-3 py-1 text-xs font-semibold text-neifert">
              <Share2 size={13} /> {shareStatsData.rate.toFixed(0)}% conversión
            </span>
          }
        />
        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex gap-4 md:flex-col md:gap-3">
            <div>
              <p className="font-display text-2xl font-extrabold text-ink">
                {shareStatsData.shares.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-ink-3">Compartidos</p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold text-neifert">
                {shareStatsData.visits.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-ink-3">Ingresos por link</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={shareSeriesData} margin={{ left: -12, right: 12, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" stroke={c.muted} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis stroke={c.muted} fontSize={11} tickLine={false} axisLine={false} width={36} />
              <Tooltip contentStyle={tooltipStyle(c)} />
              <Line type="monotone" dataKey="shares" name="Compartidos" stroke={c.ink} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="visits" name="Ingresos" stroke={c.red} strokeWidth={2.5} dot={false} />
              <Legend
                iconType="circle"
                formatter={(val) => <span style={{ color: c.inkSoft, fontSize: 11 }}>{val}</span>}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <TopVehiclesModal
        open={showAllVehicles}
        onClose={() => setShowAllVehicles(false)}
        vehicles={vehicles}
        byVehicle={allByVehicle}
      />
    </div>
  )
}
