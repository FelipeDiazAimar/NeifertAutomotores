import { TrendingUp, TrendingDown } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import { formatDelta } from '@/lib/formatters'
import { cn } from '@/lib/cn'

const ACCENTS = {
  red: 'bg-neifert/10 text-neifert',
  blue: 'bg-blue-500/10 text-blue-500',
  green: 'bg-success/10 text-success',
  amber: 'bg-amber/10 text-amber',
}

/** KPI compacto: ícono a la izquierda, etiqueta y valor apilados al lado y
 *  el delta (si hay) a la derecha — una sola fila para ocupar poca altura. */
export default function KpiCard({ icon: Icon, label, value, delta, accent = 'red' }) {
  return (
    <GlassCard className="flex items-center gap-3 px-3.5 py-2.5">
      <span
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', ACCENTS[accent])}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase leading-tight tracking-wide text-ink-3">
          {label}
        </p>
        <p className="truncate font-display text-xl font-extrabold leading-tight text-ink">
          {value}
        </p>
      </div>
      {delta != null && (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
            delta >= 0 ? 'bg-success/15 text-success' : 'bg-neifert/10 text-neifert'
          )}
        >
          {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {formatDelta(delta)}
        </span>
      )}
    </GlassCard>
  )
}
