import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Pencil, ArrowRight, ClipboardCheck, FileText, Archive, Image as ImageIcon, Circle } from 'lucide-react'
import Spinner from '@/components/common/Spinner'
import { useEventosVehiculo } from '@/crm/hooks/useEventosVehiculo'
import { textoEvento } from '@/crm/lib/textoEvento'

const ICONO = {
  alta: Plus,
  edicion: Pencil,
  cambio_estado: ArrowRight,
  peritaje: ClipboardCheck,
  gestoria: FileText,
  archivado: Archive,
  foto: ImageIcon,
}

export default function HistorialTimeline({ vehiculoId }) {
  const { data: eventos = [], isLoading } = useEventosVehiculo(vehiculoId)

  if (isLoading) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner size={24} />
      </div>
    )
  }
  if (!eventos.length) {
    return <p className="py-8 text-center text-sm text-ink-3">Todavía no hay movimientos registrados.</p>
  }

  return (
    <ol className="space-y-3">
      {eventos.map((ev) => {
        const Icono = ICONO[ev.tipo] ?? Circle
        return (
          <li key={ev.id} className="flex gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neifert/10 text-neifert">
              <Icono size={14} />
            </span>
            <div>
              <p className="text-sm text-ink">{textoEvento(ev)}</p>
              <p className="text-xs text-ink-3">
                {formatDistanceToNow(new Date(ev.creado_en), { addSuffix: true, locale: es })}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
