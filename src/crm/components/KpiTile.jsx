import GlassCard from '@/components/common/GlassCard'

export default function KpiTile({ label, valor, sub, title }) {
  return (
    <GlassCard className="flex min-w-0 flex-col overflow-hidden p-3.5 sm:p-5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-3">{label}</p>
      <p
        title={title}
        className="mt-1 font-display text-xl font-bold leading-tight text-ink [overflow-wrap:anywhere] tabular-nums sm:text-2xl lg:text-3xl"
      >
        {valor}
      </p>
      {sub != null && <p className="mt-0.5 text-xs text-ink-3 [overflow-wrap:anywhere]">{sub}</p>}
    </GlassCard>
  )
}
