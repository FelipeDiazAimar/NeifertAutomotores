import { PERITAJE_SECCIONES, estadoPeritaje, PERITAJE_ESTADO_LABEL } from '@/crm/lib/peritajeSchema'
import EstadoStrip from './EstadoStrip'
import { cn } from '@/lib/cn'

const COLOR_ESTADO = {
  ok: 'text-success',
  obs: 'text-amber',
  observacion: 'text-amber',
  'observación': 'text-amber',
  falta: 'text-neifert',
  mal: 'text-neifert',
}
const nf = new Intl.NumberFormat('es-AR')

function valorMostrado(item, raw) {
  if (raw == null || raw === '') return null
  if (item.tipo === 'moneda') return `$ ${nf.format(raw)}`
  if (item.tipo === 'porcentaje') return `${raw}%`
  return String(raw)
}

export default function PeritajeLectura({ peritaje }) {
  const datos = peritaje?.datos ?? {}
  const quien = peritaje?.peritador?.nombre || peritaje?.peritado_por_nombre
  const est = estadoPeritaje(peritaje)
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {peritaje?.fecha && (
            <span className="font-semibold text-ink">
              {new Date(peritaje.fecha).toLocaleDateString('es-AR')}
            </span>
          )}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              est === 'completo' && 'bg-success/15 text-success',
              est === 'en_proceso' && 'bg-amber/15 text-amber',
              est === 'sin_iniciar' && 'bg-ink/10 text-ink-3',
            )}
          >
            {PERITAJE_ESTADO_LABEL[est]}
          </span>
          {quien && <span className="text-sm text-ink-3">Peritó {quien}</span>}
          {peritaje?.costo_total ? (
            <span className="text-sm text-ink-3">· Costo $ {nf.format(peritaje.costo_total)}</span>
          ) : null}
        </div>
        <div className="mt-3">
          <EstadoStrip
            ok={peritaje?.items_ok ?? 0}
            obs={peritaje?.items_obs ?? 0}
            falta={peritaje?.items_falta ?? 0}
            showLegend
          />
        </div>
      </div>
      {peritaje?.resena && (
        <p className="rounded-2xl border border-line p-3 text-sm text-ink-2">{peritaje.resena}</p>
      )}
      {PERITAJE_SECCIONES.every(
        (sec) => !sec.items.some((it) => datos[it.key] != null && datos[it.key] !== ''),
      ) && <p className="text-sm text-ink-3">Sin detalle cargado en este peritaje.</p>}
      {PERITAJE_SECCIONES.map((sec) => {
        const items = sec.items.filter((it) => datos[it.key] != null && datos[it.key] !== '')
        if (!items.length) return null
        return (
          <div key={sec.id}>
            <h4 className="font-display text-sm font-bold text-ink">{sec.titulo}</h4>
            <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {items.map((it) => {
                const raw = datos[it.key]
                return (
                  <div key={it.key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-ink-3">{it.label}</dt>
                    <dd
                      className={cn(
                        'text-right font-medium text-ink',
                        it.tipo === 'estado' && COLOR_ESTADO[String(raw).toLowerCase()],
                      )}
                    >
                      {valorMostrado(it, raw)}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        )
      })}
    </div>
  )
}
