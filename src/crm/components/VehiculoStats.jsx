import { useQuery } from '@tanstack/react-query'
import { Eye, MessageCircle } from 'lucide-react'
import { fetchVehicleStats } from '@/services/events.service'
import { cn } from '@/lib/cn'

/** Vistas/consultas/tasa de conversión reales del vehículo (web pública).
 *  `variant="row"` las muestra en una sola fila con íconos, para la tarjeta
 *  de la vista en grilla; por defecto se apilan en una columna a la derecha. */
export default function VehiculoStats({ vehiculoId, variant = 'stack' }) {
  const { data } = useQuery({
    queryKey: ['eventos-vehiculo', vehiculoId],
    queryFn: () => fetchVehicleStats(vehiculoId),
    enabled: Boolean(vehiculoId),
  })
  const { views = 0, conversions = 0, rate = 0 } = data ?? {}
  const rateClass = cn('font-semibold', rate >= 15 ? 'text-success' : rate >= 5 ? 'text-amber' : 'text-ink-3')

  if (variant === 'row') {
    return (
      <div className="flex items-center gap-3 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1">
          <Eye size={12} /> {views} vistas
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={12} /> {conversions} consultas
        </span>
        <span className={rateClass}>{rate.toFixed(1)}%</span>
      </div>
    )
  }

  return (
    <div className="text-right text-xs text-ink-3">
      <p>{views} vistas</p>
      <p>{conversions} consultas</p>
      <p className={rateClass}>{rate.toFixed(1)}%</p>
    </div>
  )
}
