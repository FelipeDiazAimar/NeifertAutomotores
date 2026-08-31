import { PERITAJE_SECCIONES } from '@/crm/lib/peritajeSchema'
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
  return (
    <div className="space-y-5">
      <EstadoStrip
        ok={peritaje?.items_ok ?? 0}
        obs={peritaje?.items_obs ?? 0}
        falta={peritaje?.items_falta ?? 0}
        showLegend
      />
      {peritaje?.resena && (
        <p className="rounded-2xl border border-line p-3 text-sm text-ink-2">{peritaje.resena}</p>
      )}
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
