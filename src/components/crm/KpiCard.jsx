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

export default function KpiCard({ icon: Icon, label, value, delta, accent = 'red' }) {
  return (
    <GlassCard className="p-4 md:p-5">
      <div className="flex items-center justify-between">
        <span
          className={cn('grid h-9 w-9 place-items-center rounded-xl', ACCENTS[accent])}
        >
          <Icon size={18} />
        </span>
        {delta != null && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              delta >= 0 ? 'bg-success/15 text-success' : 'bg-neifert/10 text-neifert'
            )}
          >
            {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {formatDelta(delta)}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-3">
        {label}
      </p>
      <p className="mt-0.5 font-display text-2xl font-extrabold text-ink">{value}</p>
    </GlassCard>
  )
}
