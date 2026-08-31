import GlassCard from '@/components/common/GlassCard'

export default function KpiTile({ label, valor, sub }) {
  return (
    <GlassCard className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-ink">{valor}</p>
      {sub != null && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </GlassCard>
  )
}
