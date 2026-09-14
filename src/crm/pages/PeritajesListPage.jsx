import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import SortDropdown from '@/components/catalog/SortDropdown'
import { cn } from '@/lib/cn'
import { PERITAJE_ESTADOS, PERITAJE_ESTADO_LABEL } from '@/crm/lib/peritajeSchema'
import { usePeritajesVehiculos } from '@/crm/hooks/usePeritajes'
import { usePeritajeFiltros } from '@/crm/store/usePeritajeFiltros'
import EstadoStrip from '@/crm/components/EstadoStrip'
import VehiculoThumb from '@/crm/components/VehiculoThumb'

const nf = new Intl.NumberFormat('es-AR')
const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR') : '—')
const badgeVariant = (e) => (e === 'completo' ? 'green' : e === 'en_proceso' ? 'amber' : 'neutral')

const ORDEN_OPCIONES = [
  { id: 'marca-asc', label: 'Marca A-Z' },
  { id: 'fecha-desc', label: 'Peritados recientemente' },
  { id: 'pendientes', label: 'Con más pendientes' },
]

function ordenar(filas, orden) {
  const out = [...filas]
  if (orden === 'fecha-desc') {
    out.sort((a, b) => new Date(b.peritaje?.fecha ?? 0) - new Date(a.peritaje?.fecha ?? 0))
  } else if (orden === 'pendientes') {
    out.sort((a, b) => (b.peritaje?.items_falta ?? 999) - (a.peritaje?.items_falta ?? 999))
  } else {
    out.sort((a, b) => (a.vehiculo.marca ?? '').localeCompare(b.vehiculo.marca ?? ''))
  }
  return out
}

export default function PeritajesListPage() {
  const navigate = useNavigate()
  const {
    busqueda, estado, orden, tipos, mostrarFiltros,
    setBusqueda, setEstado, setOrden, toggleTipo, setMostrarFiltros,
  } = usePeritajeFiltros()
  const [texto, setTexto] = useState(busqueda)

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto, setBusqueda])

  const { data: todas = [], isLoading } = usePeritajesVehiculos({ busqueda })

  const tiposDisponibles = useMemo(
    () => [...new Set(todas.map((f) => f.vehiculo.tipo).filter(Boolean))].sort(),
    [todas],
  )

  const counts = useMemo(() => {
    const c = { total: todas.length, sin_iniciar: 0, en_proceso: 0, completo: 0 }
    for (const f of todas) c[f.estadoPeritaje] = (c[f.estadoPeritaje] ?? 0) + 1
    return c
  }, [todas])

  const filas = useMemo(() => {
    let out = estado ? todas.filter((f) => f.estadoPeritaje === estado) : todas
    if (tipos.length) out = out.filter((f) => tipos.includes(f.vehiculo.tipo))
    return ordenar(out, orden)
  }, [todas, estado, tipos, orden])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Peritaje</h1>
        <p className="text-sm text-ink-3">{counts.total} vehículos</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="glass field-glass flex h-12 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por marca, modelo o patente…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERITAJE_ESTADOS.map((f) => (
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
      ) : filas.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">Sin resultados</p>
          <p className="mt-1 text-sm text-ink-3">Probá con otro filtro o búsqueda.</p>
        </GlassCard>
      ) : (
        <div className="glass overflow-x-auto rounded-[20px] shadow-glass">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Vehículo</th>
                <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Estado</th>
                <th className="hidden px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:table-cell">
                  Resultado
                </th>
                <th className="hidden px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:table-cell">
                  Fecha
                </th>
                <th className="hidden px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:table-cell">
                  Peritó
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ vehiculo: v, peritaje: p, estadoPeritaje: ep, cantidad }) => (
                <tr
                  key={v.id}
                  onClick={() => navigate(`/crm/vehiculos/${v.id}?tab=peritaje`)}
                  className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <VehiculoThumb fotos={v.fotos} />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {v.marca} {v.modelo}
                        </p>
                        <p className="text-xs text-ink-3">{v.patente || '—'}</p>
                        <p className="text-xs text-ink-3 md:hidden">{fmtFecha(p?.fecha)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={badgeVariant(ep)}>{PERITAJE_ESTADO_LABEL[ep]}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {p ? (
                      <div className="w-32">
                        <EstadoStrip ok={p.items_ok} obs={p.items_obs} falta={p.items_falta} />
                        <p className="mt-1 text-xs text-ink-3">
                          {p.items_ok} ok · {p.items_obs} obs · {p.items_falta} falta
                          {cantidad > 1 ? ` · ${cantidad} peritajes` : ''}
                        </p>
                      </div>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{fmtFecha(p?.fecha)}</td>
                  <td className="hidden px-4 py-3 text-ink-2 md:table-cell">
                    {p?.peritador?.nombre || p?.peritado_por_nombre || '—'}
                    {p?.costo_total ? (
                      <span className="block text-xs text-ink-3">$ {nf.format(p.costo_total)}</span>
                    ) : null}
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
