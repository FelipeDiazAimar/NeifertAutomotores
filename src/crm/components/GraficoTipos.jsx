import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts'
import GlassCard from '@/components/common/GlassCard'

const PALETA = ['#be1e2d', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#6b7280']

export default function GraficoTipos({ datos = [] }) {
  return (
    <GlassCard className="p-5">
      <h3 className="mb-3 font-display text-sm font-bold text-ink">Tipos más pedidos</h3>
      {datos.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">Sin datos de interés todavía.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={datos} dataKey="n" nameKey="nombre" innerRadius={52} outerRadius={82} paddingAngle={2}>
              {datos.map((_, i) => (
                <Cell key={i} fill={PALETA[i % PALETA.length]} />
              ))}
            </Pie>
            <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: 'var(--c-surface-solid)', border: '1px solid var(--c-line)', borderRadius: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  )
}
