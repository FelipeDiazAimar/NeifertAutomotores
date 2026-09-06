import { Check } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Spinner from '@/components/common/Spinner'
import { GESTORIA_ITEMS } from '@/crm/lib/gestoriaSchema'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useGestoria, useGestoriaMutations } from '@/crm/hooks/useGestoria'
import { cn } from '@/lib/cn'

const ESTADO_LABEL = { sin_iniciar: 'Sin iniciar', en_proceso: 'En proceso', completo: 'Completo' }
const hoy = () => new Date().toISOString().slice(0, 10)
const fechaCorta = (f) => (f ? new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '')

export default function GestoriaChecklist({ vehiculoId }) {
  const { id: miId } = useCrmPerfil()
  const { data: g, isLoading } = useGestoria(vehiculoId)
  const { guardarCampos } = useGestoriaMutations(vehiculoId)

  if (isLoading) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner size={24} />
      </div>
    )
  }

  const estado = g?.estado ?? 'sin_iniciar'

  const toggle = (key) => {
    const hecho = !g?.[`${key}_hecho`]
    guardarCampos.mutate({
      [`${key}_hecho`]: hecho,
      [`${key}_fecha`]: hecho ? g?.[`${key}_fecha`] || hoy() : g?.[`${key}_fecha`] ?? null,
      [`${key}_por`]: hecho ? miId : g?.[`${key}_por`] ?? null,
    })
  }

  const guardarNota = (key, valor) => {
    if (valor === (g?.[`${key}_nota`] ?? '')) return
    guardarCampos.mutate({ [`${key}_nota`]: valor || null })
  }

  const guardarFechaTop = (campo, valor) => {
    if (valor === (g?.[campo] ?? '')) return
    guardarCampos.mutate({ [campo]: valor || null })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant={estado === 'completo' ? 'green' : estado === 'en_proceso' ? 'amber' : 'neutral'}>
          {ESTADO_LABEL[estado]}
        </Badge>
        <div className="flex gap-3 text-xs text-ink-3">
          <label>
            Inicio
            <input
              type="date"
              defaultValue={g?.fecha_inicio ?? ''}
              onBlur={(e) => guardarFechaTop('fecha_inicio', e.target.value)}
              className="glass field-glass ml-1 h-8 rounded-xl px-2 text-ink outline-none"
            />
          </label>
          <label>
            Cierre
            <input
              type="date"
              defaultValue={g?.fecha_cierre ?? ''}
              onBlur={(e) => guardarFechaTop('fecha_cierre', e.target.value)}
              className="glass field-glass ml-1 h-8 rounded-xl px-2 text-ink outline-none"
            />
          </label>
        </div>
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line">
        {GESTORIA_ITEMS.map(({ key, label }) => {
          const hecho = Boolean(g?.[`${key}_hecho`])
          return (
            <li key={key} className="p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-label={`${label}: ${hecho ? 'hecho' : 'pendiente'}`}
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors',
                    hecho ? 'border-success bg-success text-white' : 'border-ink/30 text-transparent',
                  )}
                >
                  <Check size={14} />
                </button>
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">{label}</span>
                <span className="w-12 shrink-0 text-right text-xs text-ink-3">
                  {hecho ? fechaCorta(g?.[`${key}_fecha`]) : ''}
                </span>
              </div>
              <input
                defaultValue={g?.[`${key}_nota`] ?? ''}
                placeholder="Nota…"
                onBlur={(e) => guardarNota(key, e.target.value)}
                className="glass field-glass mt-2 h-8 w-full rounded-xl px-2.5 text-sm text-ink outline-none"
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
