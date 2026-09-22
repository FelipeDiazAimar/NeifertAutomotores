import { useMemo, useState } from 'react'
import { Plus, SlidersHorizontal, ChevronDown } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useAlertas, useAlertaMutations } from '@/crm/hooks/useAlertas'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useAlertasFiltros } from '@/crm/store/useAlertasFiltros'
import { agrupar } from '@/crm/lib/agruparTareas'
import AlertaFilters from '@/crm/components/AlertaFilters'
import AlertaRow from '@/crm/components/AlertaRow'
import AlertaFormModal from '@/crm/components/AlertaFormModal'
import { cn } from '@/lib/cn'

const GRUPOS = [
  { key: 'vencidas', label: 'Vencidas', destacado: true },
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'despues', label: 'Más adelante' },
]

export default function AlertasListPage() {
  const { id: miId, esAdmin } = useCrmPerfil()
  const { filtros, incluirHechas } = useAlertasFiltros()
  const filtrosActivos = useAlertasFiltros((s) => s.contarFiltrosActivos())
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [modal, setModal] = useState({ open: false, alerta: null })
  const [verHechas, setVerHechas] = useState(false)
  const { toggleHecha, eliminar } = useAlertaMutations()

  useCrmRealtime('alertas', ['crm', 'alertas'])

  const opts = useMemo(() => {
    const f = { ...filtros }
    if (f.asignadoA === 'mias') f.asignadoA = miId
    return { filtros: f, incluirHechas }
  }, [filtros, incluirHechas, miId])

  const { data: alertas, isLoading } = useAlertas(opts)
  const g = useMemo(() => agrupar((alertas ?? []).map((a) => ({ ...a, done: a.hecha }))), [alertas])
  const total = alertas?.length ?? 0

  const filaProps = {
    onToggle: (a, hecha) => toggleHecha.mutate({ id: a.id, hecha }),
    onEditar: (a) => setModal({ open: true, alerta: a }),
    onEliminar: (id) => eliminar.mutate(id),
    puedeEliminar: esAdmin,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Alertas</h1>
        <div className="flex items-center gap-2">
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
          <Button icon={Plus} onClick={() => setModal({ open: true, alerta: null })}>
            Nueva alerta
          </Button>
        </div>
      </div>

      {mostrarFiltros && <AlertaFilters />}

      {isLoading ? (
        <div className="grid place-items-center py-16"><Spinner size={28} /></div>
      ) : total === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay alertas</p>
          <p className="mt-1 text-sm text-ink-3">Creá una para avisarle a alguien antes de que venza algo.</p>
          <Button icon={Plus} className="mt-4" onClick={() => setModal({ open: true, alerta: null })}>
            Nueva alerta
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map(({ key, label, destacado }) =>
            g[key].length ? (
              <section key={key}>
                <h2 className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', destacado ? 'text-neifert' : 'text-ink-3')}>
                  {label} · {g[key].length}
                </h2>
                <div className="space-y-2">
                  {g[key].map((a) => <AlertaRow key={a.id} alerta={a} {...filaProps} />)}
                </div>
              </section>
            ) : null,
          )}

          {g.hechas.length > 0 && (
            <section>
              <button onClick={() => setVerHechas((v) => !v)} className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
                <ChevronDown size={14} className={cn('transition-transform', verHechas && 'rotate-180')} />
                Hechas · {g.hechas.length}
              </button>
              {verHechas && (
                <div className="space-y-2">
                  {g.hechas.map((a) => <AlertaRow key={a.id} alerta={a} {...filaProps} />)}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <AlertaFormModal open={modal.open} alerta={modal.alerta} onClose={() => setModal({ open: false, alerta: null })} />
    </div>
  )
}
