import { Filter, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Select from '@/components/common/Select'
import { useAlertasFiltros } from '@/crm/store/useAlertasFiltros'
import { useCrmUsuarios } from '@/crm/hooks/useCrmUsuarios'

export default function AlertaFilters() {
  const { data: usuarios = [] } = useCrmUsuarios()
  const filtros = useAlertasFiltros((s) => s.filtros)
  const incluirHechas = useAlertasFiltros((s) => s.incluirHechas)
  const setFiltro = useAlertasFiltros((s) => s.setFiltro)
  const setIncluirHechas = useAlertasFiltros((s) => s.setIncluirHechas)
  const resetFiltros = useAlertasFiltros((s) => s.resetFiltros)
  const activos = useAlertasFiltros((s) => s.contarFiltrosActivos())

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

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Asignado a"
          options={opcionesAsignado}
          value={filtros.asignadoA}
          onChange={(v) => setFiltro('asignadoA', v)}
        />
        <label className="flex items-center gap-2 self-end pb-2.5 text-xs text-ink-2">
          <input type="checkbox" checked={incluirHechas} onChange={(e) => setIncluirHechas(e.target.checked)} />
          Incluir hechas
        </label>
      </div>
    </div>
  )
}
