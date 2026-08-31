import { Filter, X } from 'lucide-react'
import Button from '@/components/common/Button'
import { useVehiculosFiltros } from '@/crm/store/useVehiculosFiltros'
import { cn } from '@/lib/cn'

const ESTADOS = [
  { id: 'disponible', label: 'Disponible' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'vendido', label: 'Vendido' },
  { id: 'baja', label: 'Baja' },
]
const TIPOS = ['Pickup', 'Sedan', 'SUV', 'Hatchback', 'Utilitario', 'Coupé']

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        activo ? 'bg-neifert text-white' : 'glass text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export default function VehiculoFilters() {
  const filtros = useVehiculosFiltros((s) => s.filtros)
  const setFiltro = useVehiculosFiltros((s) => s.setFiltro)
  const resetFiltros = useVehiculosFiltros((s) => s.resetFiltros)
  const activos = useVehiculosFiltros((s) => s.contarFiltrosActivos())

  const toggleEn = (clave, valor) => {
    const actual = filtros[clave]
    setFiltro(clave, actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor])
  }

  return (
    <div className="glass space-y-4 rounded-[20px] p-4 shadow-glass">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          <Filter size={14} /> Filtros {activos > 0 && `(${activos})`}
        </span>
        {activos > 0 && (
          <Button variant="ghost" size="sm" icon={X} onClick={resetFiltros}>
            Limpiar
          </Button>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Estado</p>
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((e) => (
            <Chip key={e.id} activo={filtros.estado.includes(e.id)} onClick={() => toggleEn('estado', e.id)}>
              {e.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Tipo</p>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <Chip key={t} activo={filtros.tipo.includes(t)} onClick={() => toggleEn('tipo', t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-ink-3">
          Año desde
          <input
            type="number"
            value={filtros.anioMin}
            onChange={(e) => setFiltro('anioMin', e.target.value)}
            className="glass field-glass mt-1 h-10 w-full rounded-2xl px-3 text-sm text-ink outline-none"
          />
        </label>
        <label className="text-xs text-ink-3">
          Año hasta
          <input
            type="number"
            value={filtros.anioMax}
            onChange={(e) => setFiltro('anioMax', e.target.value)}
            className="glass field-glass mt-1 h-10 w-full rounded-2xl px-3 text-sm text-ink outline-none"
          />
        </label>
        <label className="text-xs text-ink-3">
          Precio desde
          <input
            type="number"
            value={filtros.precioMin}
            onChange={(e) => setFiltro('precioMin', e.target.value)}
            className="glass field-glass mt-1 h-10 w-full rounded-2xl px-3 text-sm text-ink outline-none"
          />
        </label>
        <label className="text-xs text-ink-3">
          Precio hasta
          <input
            type="number"
            value={filtros.precioMax}
            onChange={(e) => setFiltro('precioMax', e.target.value)}
            className="glass field-glass mt-1 h-10 w-full rounded-2xl px-3 text-sm text-ink outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <span>Moneda:</span>
          {['', 'ARS', 'USD'].map((m) => (
            <Chip key={m || 'todas'} activo={filtros.moneda === m} onClick={() => setFiltro('moneda', m)}>
              {m || 'Todas'}
            </Chip>
          ))}
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={filtros.incluirArchivados}
            onChange={(e) => setFiltro('incluirArchivados', e.target.checked)}
          />
          Incluir archivados
        </label>
      </div>
    </div>
  )
}
