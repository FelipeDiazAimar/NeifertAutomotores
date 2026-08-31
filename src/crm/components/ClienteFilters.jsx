import { Filter, X } from 'lucide-react'
import Button from '@/components/common/Button'
import { useClientesFiltros } from '@/crm/store/useClientesFiltros'
import { CANAL_OPCIONES } from '@/crm/lib/formatCliente'
import { cn } from '@/lib/cn'

const STATUS = [
  { id: 'activo', label: 'Activo' },
  { id: 'en_seguimiento', label: 'En seguimiento' },
  { id: 'vendido', label: 'Vendido' },
  { id: 'perdido', label: 'Perdido' },
]

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

export default function ClienteFilters() {
  const filtros = useClientesFiltros((s) => s.filtros)
  const setFiltro = useClientesFiltros((s) => s.setFiltro)
  const resetFiltros = useClientesFiltros((s) => s.resetFiltros)
  const activos = useClientesFiltros((s) => s.contarFiltrosActivos())

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
          {STATUS.map((s) => (
            <Chip key={s.id} activo={filtros.status.includes(s.id)} onClick={() => toggleEn('status', s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Canal</p>
        <div className="flex flex-wrap gap-1.5">
          {CANAL_OPCIONES.map((c) => (
            <Chip key={c.id} activo={filtros.canal.includes(c.id)} onClick={() => toggleEn('canal', c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filtros.conAutoEntrega} onChange={(e) => setFiltro('conAutoEntrega', e.target.checked)} />
          Con auto en entrega
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filtros.interesCeroKm} onChange={(e) => setFiltro('interesCeroKm', e.target.checked)} />
          Interés 0 km
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filtros.incluirArchivados} onChange={(e) => setFiltro('incluirArchivados', e.target.checked)} />
          Incluir archivados
        </label>
      </div>
    </div>
  )
}
