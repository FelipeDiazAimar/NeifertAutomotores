import { cn } from '@/lib/cn'

/** Barra segmentada del estado de un peritaje: proporción ok / observación /
 *  falta. Se lee de un vistazo. */
export default function EstadoStrip({ ok = 0, obs = 0, falta = 0, showLegend = false, className }) {
  const total = ok + obs + falta
  const label = `${ok} ok, ${obs} observaciones, ${falta} fallas`

  return (
    <div className={cn('w-full', className)}>
      <div
        role="img"
        aria-label={label}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
      >
        {total > 0 && (
          <>
            <span className="bg-success" style={{ flexGrow: ok }} />
            <span className="bg-amber" style={{ flexGrow: obs }} />
            <span className="bg-neifert" style={{ flexGrow: falta }} />
          </>
        )}
      </div>
      {showLegend && (
        <div className="mt-1 flex gap-3 text-xs text-ink-3">
          <span className="text-success">● {ok}</span>
          <span className="text-amber">▲ {obs}</span>
          <span className="text-neifert">✕ {falta}</span>
        </div>
      )}
    </div>
  )
}
