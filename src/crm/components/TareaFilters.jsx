import { Filter, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Select from '@/components/common/Select'
import { useTareasFiltros } from '@/crm/store/useTareasFiltros'
import { useCrmUsuarios } from '@/crm/hooks/useCrmUsuarios'
import { cn } from '@/lib/cn'

const PRIORIDADES = [
  { id: 'baja', label: 'Baja' },
  { id: 'normal', label: 'Normal' },
  { id: 'alta', label: 'Alta' },
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

export default function TareaFilters() {
  const { data: usuarios = [] } = useCrmUsuarios()
  const filtros = useTareasFiltros((s) => s.filtros)
  const incluirHechas = useTareasFiltros((s) => s.incluirHechas)
  const incluirArchivadas = useTareasFiltros((s) => s.incluirArchivadas)
  const setFiltro = useTareasFiltros((s) => s.setFiltro)
  const setIncluirHechas = useTareasFiltros((s) => s.setIncluirHechas)
  const setIncluirArchivadas = useTareasFiltros((s) => s.setIncluirArchivadas)
  const resetFiltros = useTareasFiltros((s) => s.resetFiltros)
  const activos = useTareasFiltros((s) => s.contarFiltrosActivos())

  const togglePrioridad = (p) => {
    const a = filtros.prioridad
    setFiltro('prioridad', a.includes(p) ? a.filter((x) => x !== p) : [...a, p])
  }

  const opcionesAsignado = [
    { id: 'todos', label: 'Todos' },
    { id: 'mias', label: 'Mías' },
    ...usuarios.map((u) => ({ id: u.id, label: u.nombre })),
  ]

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

      <div className="max-w-xs">
        <Select
          label="Asignado a"
          options={opcionesAsignado}
          value={filtros.asignadoA}
          onChange={(v) => setFiltro('asignadoA', v)}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Prioridad</p>
        <div className="flex flex-wrap gap-1.5">
          {PRIORIDADES.map((p) => (
            <Chip key={p.id} activo={filtros.prioridad.includes(p.id)} onClick={() => togglePrioridad(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filtros.soloConCliente} onChange={(e) => setFiltro('soloConCliente', e.target.checked)} />
          Solo con cliente
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={incluirHechas} onChange={(e) => setIncluirHechas(e.target.checked)} />
          Incluir hechas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={incluirArchivadas} onChange={(e) => setIncluirArchivadas(e.target.checked)} />
          Incluir archivadas
        </label>
      </div>
    </div>
  )
}
