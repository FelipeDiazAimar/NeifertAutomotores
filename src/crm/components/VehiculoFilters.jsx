import { Filter, X } from 'lucide-react'
import Button from '@/components/common/Button'
import { useVehiculosFiltros } from '@/crm/store/useVehiculosFiltros'
import { cn } from '@/lib/cn'
import { formatMiles, parseMiles } from '@/lib/numberMask'

import { useSiteStore } from '@/store/useSiteStore'

const ESTADOS = [
  { id: 'disponible', label: 'Disponible' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'vendido', label: 'Vendido' },
  { id: 'baja', label: 'Baja' },
]
const TIPOS_SEED = [
  'Pickup',
  'Sedan',
  'SUV',
  'Hatchback',
  'Utilitario',
  'Coupé',
  'Familiar',
  'Otro',
]

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        activo ? 'bg-neifert text-white' : 'glass text-ink-2 hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

export default function VehiculoFilters() {
  const filtros = useVehiculosFiltros((s) => s.filtros)
  const categories = useSiteStore((s) => s.categories)
  const TIPOS = [...TIPOS_SEED, ...categories.map((c) => c.label)].filter(
    (v, i, a) => v && a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i
  )
  const setFiltro = useVehiculosFiltros((s) => s.setFiltro)
  const resetFiltros = useVehiculosFiltros((s) => s.resetFiltros)
  const activos = useVehiculosFiltros((s) => s.contarFiltrosActivos())

  const toggleEn = (clave, valor) => {
    const actual = filtros[clave]
    setFiltro(
      clave,
      actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]
    )
  }

  return (
    <div className="glass shadow-glass space-y-4 rounded-[20px] p-4">
      <div className="flex items-center justify-between">
        <span className="text-ink-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Filter size={14} /> Filtros {activos > 0 && `(${activos})`}
        </span>
        {activos > 0 && (
          <Button variant="ghost" size="sm" icon={X} onClick={resetFiltros}>
            Limpiar
          </Button>
        )}
      </div>

      <div>
        <p className="text-ink-3 mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
          Estado
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((e) => (
            <Chip
              key={e.id}
              activo={filtros.estado.includes(e.id)}
              onClick={() => toggleEn('estado', e.id)}
            >
              {e.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-ink-3 mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
          Condición
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: '', label: 'Todos' },
            { id: 'cero', label: '0 km' },
            { id: 'usados', label: 'Usados' },
          ].map((c) => (
            <Chip
              key={c.id || 'todos'}
              activo={filtros.condicion === c.id}
              onClick={() => setFiltro('condicion', c.id)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-ink-3 mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
          Tipo
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <Chip
              key={t}
              activo={filtros.tipo.includes(t)}
              onClick={() => toggleEn('tipo', t)}
            >
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-ink-3 text-xs">
          Año desde
          <input
            type="number"
            value={filtros.anioMin}
            onChange={(e) => setFiltro('anioMin', e.target.value)}
            className="glass field-glass text-ink mt-1 h-10 w-full rounded-2xl px-3 text-sm outline-none"
          />
        </label>
        <label className="text-ink-3 text-xs">
          Año hasta
          <input
            type="number"
            value={filtros.anioMax}
            onChange={(e) => setFiltro('anioMax', e.target.value)}
            className="glass field-glass text-ink mt-1 h-10 w-full rounded-2xl px-3 text-sm outline-none"
          />
        </label>
        <label className="text-ink-3 text-xs">
          Precio desde
          <input
            inputMode="numeric"
            value={formatMiles(filtros.precioMin)}
            onChange={(e) => setFiltro('precioMin', parseMiles(e.target.value))}
            className="glass field-glass text-ink mt-1 h-10 w-full rounded-2xl px-3 text-sm outline-none"
          />
        </label>
        <label className="text-ink-3 text-xs">
          Precio hasta
          <input
            inputMode="numeric"
            value={formatMiles(filtros.precioMax)}
            onChange={(e) => setFiltro('precioMax', parseMiles(e.target.value))}
            className="glass field-glass text-ink mt-1 h-10 w-full rounded-2xl px-3 text-sm outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-ink-2 flex items-center gap-2 text-xs">
          <span>Moneda:</span>
          {['', 'ARS', 'USD'].map((m) => (
            <Chip
              key={m || 'todas'}
              activo={filtros.moneda === m}
              onClick={() => setFiltro('moneda', m)}
            >
              {m || 'Todas'}
            </Chip>
          ))}
        </label>
      </div>
    </div>
  )
}
