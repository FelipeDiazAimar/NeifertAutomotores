import GlassCard from '@/components/common/GlassCard'

export default function KpiTile({ label, valor, sub }) {
  return (
    <GlassCard className="min-w-0 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold leading-tight text-ink [overflow-wrap:anywhere] tabular-nums sm:text-3xl">
        {valor}
      </p>
      {sub != null && <p className="mt-0.5 text-xs text-ink-3 [overflow-wrap:anywhere]">{sub}</p>}
    </GlassCard>
  )
}
