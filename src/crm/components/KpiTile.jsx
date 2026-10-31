import GlassCard from '@/components/common/GlassCard'

/** KPI compacto del panel: etiqueta, valor y detalle en poco alto. */
export default function KpiTile({ label, valor, sub, title }) {
  return (
    <GlassCard className="flex min-w-0 flex-col overflow-hidden px-3.5 py-2.5 sm:px-4">
      <p className="truncate text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-3">
        {label}
      </p>
      <p
        title={title}
        className="font-display text-xl font-bold leading-tight text-ink tabular-nums [overflow-wrap:anywhere] sm:text-2xl"
      >
        {valor}
      </p>
      {sub != null && (
        <p className="truncate text-[11px] leading-tight text-ink-3">{sub}</p>
      )}
    </GlassCard>
  )
}
