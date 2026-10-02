import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import SortDropdown from '@/components/catalog/SortDropdown'
import { cn } from '@/lib/cn'
import { GESTORIA_ITEMS, fechasGestoria } from '@/crm/lib/gestoriaSchema'
import { useGestoriasTodas } from '@/crm/hooks/useGestoria'
import { useGestoriaFiltros } from '@/crm/store/useGestoriaFiltros'
import { useViewModeStore } from '@/crm/store/useViewModeStore'
import VehiculoThumb from '@/crm/components/VehiculoThumb'
import ViewModeToggle from '@/crm/components/ViewModeToggle'

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

const ORDEN_OPCIONES = [
  { id: 'marca-asc', label: 'Marca A-Z' },
  { id: 'actualizado-desc', label: 'Actualizadas recientemente' },
  { id: 'faltantes', label: 'Con más trámites pendientes' },
]

function ordenar(filas, orden) {
  const out = [...filas]
  if (orden === 'actualizado-desc') {
    out.sort((a, b) => new Date(b.actualizado_en ?? 0) - new Date(a.actualizado_en ?? 0))
  } else if (orden === 'faltantes') {
    out.sort((a, b) => hechos(a) - hechos(b))
  } else {
    out.sort((a, b) => (a.vehiculo?.marca ?? '').localeCompare(b.vehiculo?.marca ?? ''))
  }
  return out
}

export default function GestoriaListPage() {
  const navigate = useNavigate()
  const {
    busqueda: q, estado, orden, tipos, mostrarFiltros,
    setBusqueda: setQ, setEstado, setOrden, toggleTipo, setMostrarFiltros,
  } = useGestoriaFiltros()
  const { data: todas = [], isLoading } = useGestoriasTodas()
  const viewMode = useViewModeStore((s) => s.viewMode)

  const tiposDisponibles = useMemo(
    () => [...new Set(todas.map((g) => g.vehiculo?.tipo).filter(Boolean))].sort(),
    [todas],
  )

  const counts = useMemo(() => {
    const c = { total: todas.length, sin_iniciar: 0, en_proceso: 0, completo: 0 }
    for (const g of todas) c[g.estado] = (c[g.estado] ?? 0) + 1
    return c
  }, [todas])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    let out = todas.filter((g) => {
      if (estado && g.estado !== estado) return false
      if (tipos.length && !tipos.includes(g.vehiculo?.tipo)) return false
      if (!t) return true
      const v = g.vehiculo ?? {}
      return `${v.marca ?? ''} ${v.modelo ?? ''} ${v.patente ?? ''}`.toLowerCase().includes(t)
    })
    return ordenar(out, orden)
  }, [todas, estado, tipos, q, orden])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Gestoría</h1>
        <p className="text-sm text-ink-3">{counts.total} vehículos con trámites</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="glass field-glass flex h-12 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por marca, modelo o patente…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setEstado(f.id)}
              className={cn(
                'glass flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors',
                estado === f.id ? 'text-neifert' : 'text-ink-2 hover:text-ink',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold',
                  estado === f.id ? 'bg-neifert text-white' : 'bg-ink/10 text-ink-3',
                )}
              >
                {f.id ? counts[f.id] : counts.total}
              </span>
            </button>
          ))}
          <SortDropdown sort={orden} setSort={setOrden} options={ORDEN_OPCIONES} label="Orden:" />
          <ViewModeToggle />
          {tiposDisponibles.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarFiltros((v) => !v)}
              aria-expanded={mostrarFiltros}
              className={cn(
                'glass flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors',
                mostrarFiltros || tipos.length > 0 ? 'text-neifert' : 'text-ink-2 hover:text-ink',
              )}
            >
              <SlidersHorizontal size={15} />
              Filtros
              {tipos.length > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
                  {tipos.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {mostrarFiltros && tiposDisponibles.length > 0 && (
        <div className="glass flex flex-wrap gap-2 rounded-2xl p-3">
          {tiposDisponibles.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTipo(t)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                tipos.includes(t) ? 'bg-neifert text-white' : 'bg-ink/5 text-ink-2 hover:bg-ink/10',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : visibles.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">
            {q.trim() || estado ? 'Sin resultados' : 'Sin gestorías'}
          </p>
          <p className="mt-1 text-sm text-ink-3">
            {q.trim() || estado
              ? 'Probá con otro filtro o búsqueda.'
              : 'Se arman desde la ficha de cada vehículo, pestaña Gestoría.'}
          </p>
        </GlassCard>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((g) => {
            const { inicio, cierre } = fechasGestoria(g)
            return (
              <GlassCard
                key={g.id}
                onClick={() => navigate(`/crm/vehiculos/${g.vehiculo?.id}?tab=gestoria`)}
                className="cursor-pointer p-3 transition-colors hover:border-ink/20"
              >
                <div className="flex items-start gap-3">
                  <VehiculoThumb fotos={g.vehiculo?.fotos} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {g.vehiculo?.marca} {g.vehiculo?.modelo}
                    </p>
                    <p className="text-xs text-ink-3">{g.vehiculo?.patente || '—'}</p>
                  </div>
                  <Badge variant={g.estado === 'completo' ? 'green' : g.estado === 'en_proceso' ? 'amber' : 'neutral'}>
                    {ESTADO_LABEL[g.estado] ?? g.estado}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-2">
                  <span>
                    {hechos(g)}/{TOTAL} trámites
                  </span>
                  <span className="text-right">
                    {fmtFecha(inicio)} → {fmtFecha(cierre)}
                  </span>
                </div>
              </GlassCard>
            )
          })}
        </div>
      ) : (
        <div className="glass overflow-x-auto rounded-[20px] shadow-glass">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Vehículo</th>
                <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Estado</th>
                <th className="hidden px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:table-cell">
                  Trámites
                </th>
                <th className="hidden px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:table-cell">
                  Inicio
                </th>
                <th className="hidden px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:table-cell">
                  Cierre
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((g) => {
                const { inicio, cierre } = fechasGestoria(g)
                return (
                  <tr
                    key={g.id}
                    onClick={() => navigate(`/crm/vehiculos/${g.vehiculo?.id}?tab=gestoria`)}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <VehiculoThumb fotos={g.vehiculo?.fotos} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">
                            {g.vehiculo?.marca} {g.vehiculo?.modelo}
                          </p>
                          <p className="text-xs text-ink-3">{g.vehiculo?.patente || '—'}</p>
                          <p className="text-xs text-ink-3 sm:hidden">
                            {hechos(g)}/{TOTAL} trámites
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={g.estado === 'completo' ? 'green' : g.estado === 'en_proceso' ? 'amber' : 'neutral'}>
                        {ESTADO_LABEL[g.estado] ?? g.estado}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-ink-2 sm:table-cell">
                      {hechos(g)}/{TOTAL}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{fmtFecha(inicio)}</td>
                    <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{fmtFecha(cierre)}</td>
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
