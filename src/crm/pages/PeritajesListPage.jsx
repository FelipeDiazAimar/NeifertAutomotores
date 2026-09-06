import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import { cn } from '@/lib/cn'
import { usePeritajesTodos } from '@/crm/hooks/usePeritajes'
import EstadoStrip from '@/crm/components/EstadoStrip'

const nf = new Intl.NumberFormat('es-AR')
const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR') : '—')

export default function PeritajesListPage() {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloConFaltas, setSoloConFaltas] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const { data: filas = [], isLoading } = usePeritajesTodos({ busqueda, soloConFaltas })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Peritajes</h1>
        <p className="text-sm text-ink-3">{filas.length} peritajes cargados</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="glass field-glass flex h-12 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por marca, modelo o patente…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <button
          type="button"
          onClick={() => setSoloConFaltas((v) => !v)}
          aria-pressed={soloConFaltas}
          className={cn(
            'glass flex h-12 shrink-0 items-center rounded-2xl px-4 text-sm font-semibold transition-colors',
            soloConFaltas ? 'text-neifert' : 'text-ink-2 hover:text-ink',
          )}
        >
          Con faltas
        </button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filas.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay peritajes</p>
          <p className="mt-1 text-sm text-ink-3">
            Se cargan desde la ficha de cada vehículo, pestaña Peritaje.
          </p>
        </GlassCard>
      ) : (
        <div className="glass overflow-x-auto rounded-[20px] shadow-glass">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {['Vehículo', 'Fecha', 'Peritó', 'Estado', 'Costo'].map((h) => (
                  <th key={h} className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/crm/vehiculos/${p.vehiculo?.id}?tab=peritaje`)}
                  className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">
                      {p.vehiculo?.marca} {p.vehiculo?.modelo}
                    </p>
                    <p className="text-xs text-ink-3">{p.vehiculo?.patente || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{fmtFecha(p.fecha)}</td>
                  <td className="px-4 py-3 text-ink-2">{p.peritador?.nombre || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="w-24">
                      <EstadoStrip ok={p.items_ok} obs={p.items_obs} falta={p.items_falta} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {p.costo_total ? `$ ${nf.format(p.costo_total)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
