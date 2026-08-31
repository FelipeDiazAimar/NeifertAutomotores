import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from 'recharts'
import GlassCard from '@/components/common/GlassCard'

// Gama del rojo Neifert, de más intenso (marca más pedida) a más claro.
const GAMA_ROJO = ['#be1e2d', '#cf3b48', '#dc5b66', '#e67d86', '#efa0a7', '#f6c2c7']
const TOPE = 6

export default function GraficoMarcas({ datos = [] }) {
  const top = datos.slice(0, TOPE)
  return (
    <GlassCard className="p-5">
      <h3 className="mb-3 font-display text-sm font-bold text-ink">Marcas más pedidas</h3>
      {top.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">Sin datos de interés todavía.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
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
            <Bar dataKey="n" radius={[0, 6, 6, 0]}>
              {top.map((_, i) => (
                <Cell key={i} fill={GAMA_ROJO[i % GAMA_ROJO.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  )
}
