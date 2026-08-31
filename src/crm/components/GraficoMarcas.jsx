import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import GlassCard from '@/components/common/GlassCard'

export default function GraficoMarcas({ datos = [] }) {
  return (
    <GlassCard className="p-5">
      <h3 className="mb-3 font-display text-sm font-bold text-ink">Marcas más pedidas</h3>
      {datos.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">Sin datos de interés todavía.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="nombre"
              width={90}
              tick={{ fontSize: 12, fill: 'var(--c-text-2)' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--c-line)' }}
              contentStyle={{ background: 'var(--c-surface-solid)', border: '1px solid var(--c-line)', borderRadius: 12 }}
            />
            <Bar dataKey="n" fill="var(--color-neifert)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  )
}
