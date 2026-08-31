import GlassCard from '@/components/common/GlassCard'

export default function VehiculosPlaceholderPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <GlassCard className="max-w-sm p-8 text-center">
        <p className="font-display text-lg font-bold text-ink">Módulo de vehículos</p>
        <p className="mt-1 text-sm text-ink-3">
          En construcción — llega en el Plan 2 (lista, alta/edición, ficha,
          peritaje y gestoría).
        </p>
      </GlassCard>
    </div>
  )
}
