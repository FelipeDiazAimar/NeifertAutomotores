import { useQuery } from '@tanstack/react-query'
import { fetchVehicleStats } from '@/services/events.service'
import { cn } from '@/lib/cn'

/** Vistas/consultas/tasa de conversión reales del vehículo (web pública). */
export default function VehiculoStats({ vehiculoId }) {
  const { data } = useQuery({
    queryKey: ['eventos-vehiculo', vehiculoId],
    queryFn: () => fetchVehicleStats(vehiculoId),
    enabled: Boolean(vehiculoId),
  })
  const { views = 0, conversions = 0, rate = 0 } = data ?? {}

  return (
    <div className="text-right text-xs text-ink-3">
      <p>{views} vistas</p>
      <p>{conversions} consultas</p>
      <p
        className={cn(
          'font-semibold',
          rate >= 15 ? 'text-success' : rate >= 5 ? 'text-amber' : 'text-ink-3',
        )}
      >
        {rate.toFixed(1)}%
      </p>
    </div>
  )
}
