import { useMemo, useState } from 'react'
import { Plus, SlidersHorizontal, ChevronDown } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useTareas, useTareaMutations } from '@/crm/hooks/useTareas'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useTareasFiltros } from '@/crm/store/useTareasFiltros'
import { agrupar } from '@/crm/lib/agruparTareas'
import TareaFilters from '@/crm/components/TareaFilters'
import TareaRow from '@/crm/components/TareaRow'
import TareaFormModal from '@/crm/components/TareaFormModal'
import { cn } from '@/lib/cn'

const GRUPOS = [
  { key: 'vencidas', label: 'Vencidas', destacado: true },
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'despues', label: 'Más adelante' },
]

export default function TareasListPage() {
  const { id: miId, esAdmin } = useCrmPerfil()
  const { filtros, incluirHechas, incluirArchivadas } = useTareasFiltros()
  const filtrosActivos = useTareasFiltros((s) => s.contarFiltrosActivos())
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [modal, setModal] = useState({ open: false, tarea: null })
  const [verHechas, setVerHechas] = useState(false)
  const { toggleDone, archivar, eliminar } = useTareaMutations()

  useCrmRealtime('tareas', ['crm', 'tareas'])

  const opts = useMemo(() => {
    const f = { ...filtros }
    if (f.asignadoA === 'mias') f.asignadoA = miId
    return { filtros: f, incluirHechas, incluirArchivadas }
  }, [filtros, incluirHechas, incluirArchivadas, miId])

  const { data: tareas, isLoading } = useTareas(opts)
  const g = useMemo(() => agrupar(tareas ?? []), [tareas])
  const total = tareas?.length ?? 0

  const filaProps = {
    onToggle: (t, done) => toggleDone.mutate({ id: t.id, done }),
    onEditar: (t) => setModal({ open: true, tarea: t }),
    onArchivar: (id) => archivar.mutate(id),
    onEliminar: (id) => eliminar.mutate(id),
    puedeEliminar: esAdmin,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Tareas</h1>
        <Button icon={Plus} onClick={() => setModal({ open: true, tarea: null })}>
          Nueva tarea
        </Button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          aria-expanded={mostrarFiltros}
          className={cn(
            'glass flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors',
            mostrarFiltros || filtrosActivos > 0 ? 'text-neifert' : 'text-ink-2 hover:text-ink',
          )}
        >
          <SlidersHorizontal size={16} />
          Filtros
          {filtrosActivos > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {mostrarFiltros && <TareaFilters />}

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : total === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay tareas</p>
          <p className="mt-1 text-sm text-ink-3">Creá una para no perder de vista un llamado o un trámite.</p>
          <Button icon={Plus} className="mt-4" onClick={() => setModal({ open: true, tarea: null })}>
            Nueva tarea
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map(({ key, label, destacado }) =>
            g[key].length ? (
              <section key={key}>
                <h2
                  className={cn(
                    'mb-2 text-xs font-semibold uppercase tracking-wide',
                    destacado ? 'text-neifert' : 'text-ink-3',
                  )}
                >
                  {label} · {g[key].length}
                </h2>
                <div className="space-y-2">
                  {g[key].map((t) => (
                    <TareaRow key={t.id} tarea={t} {...filaProps} />
                  ))}
                </div>
              </section>
            ) : null,
          )}

          {g.hechas.length > 0 && (
            <section>
              <button
                onClick={() => setVerHechas((v) => !v)}
                className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3"
              >
                <ChevronDown size={14} className={cn('transition-transform', verHechas && 'rotate-180')} />
                Hechas · {g.hechas.length}
              </button>
              {verHechas && (
                <div className="space-y-2">
                  {g.hechas.map((t) => (
                    <TareaRow key={t.id} tarea={t} {...filaProps} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <TareaFormModal
        open={modal.open}
        tarea={modal.tarea}
        onClose={() => setModal({ open: false, tarea: null })}
      />
    </div>
  )
}
