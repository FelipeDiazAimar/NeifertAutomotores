import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Badge from '@/components/common/Badge'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import { cn } from '@/lib/cn'
import { GESTORIA_ITEMS, fechasGestoria } from '@/crm/lib/gestoriaSchema'
import { useGestoriasTodas } from '@/crm/hooks/useGestoria'

const ESTADO_LABEL = { sin_iniciar: 'Sin iniciar', en_proceso: 'En proceso', completo: 'Completo' }
const FILTROS = [
  { id: null, label: 'Todas' },
  { id: 'sin_iniciar', label: 'Sin iniciar' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'completo', label: 'Completas' },
]
const TOTAL = GESTORIA_ITEMS.length
const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR') : '—')
const hechos = (g) => GESTORIA_ITEMS.filter(({ key }) => g[`${key}_hecho`]).length

export default function GestoriaListPage() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState(null)
  const { data: filas = [], isLoading } = useGestoriasTodas(estado ? { estado } : {})

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Gestoría</h1>
        <p className="text-sm text-ink-3">{filas.length} vehículos con trámites</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setEstado(f.id)}
            className={cn(
              'glass rounded-2xl px-4 py-2 text-sm font-semibold transition-colors',
              estado === f.id ? 'text-neifert' : 'text-ink-2 hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filas.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">Sin gestorías</p>
          <p className="mt-1 text-sm text-ink-3">
            Se arman desde la ficha de cada vehículo, pestaña Gestoría.
          </p>
        </GlassCard>
      ) : (
        <div className="glass overflow-x-auto rounded-[20px] shadow-glass">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {['Vehículo', 'Estado', 'Trámites', 'Inicio', 'Cierre'].map((h) => (
                  <th key={h} className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => {
                const { inicio, cierre } = fechasGestoria(g)
                return (
                  <tr
                    key={g.id}
                    onClick={() => navigate(`/crm/vehiculos/${g.vehiculo?.id}?tab=gestoria`)}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {g.vehiculo?.marca} {g.vehiculo?.modelo}
                      </p>
                      <p className="text-xs text-ink-3">{g.vehiculo?.patente || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={g.estado === 'completo' ? 'green' : g.estado === 'en_proceso' ? 'amber' : 'neutral'}>
                        {ESTADO_LABEL[g.estado] ?? g.estado}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {hechos(g)}/{TOTAL}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{fmtFecha(inicio)}</td>
                    <td className="px-4 py-3 text-ink-2">{fmtFecha(cierre)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
