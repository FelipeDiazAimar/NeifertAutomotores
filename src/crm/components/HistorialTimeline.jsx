import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Pencil, ArrowRight, ClipboardCheck, FileText, Archive, Image as ImageIcon, Circle } from 'lucide-react'
import Spinner from '@/components/common/Spinner'
import { useEventosVehiculo } from '@/crm/hooks/useEventosVehiculo'

const ICONO = {
  alta: Plus,
  edicion: Pencil,
  cambio_estado: ArrowRight,
  peritaje: ClipboardCheck,
  gestoria: FileText,
  archivado: Archive,
  foto: ImageIcon,
}

export function textoEvento(ev) {
  const quien = ev.usuario?.nombre ?? 'Alguien'
  const d = ev.datos ?? {}
  switch (ev.tipo) {
    case 'alta':
      return `${quien} cargó el vehículo`
    case 'edicion':
      return `${quien} editó ${d.campos?.length ? d.campos.join(', ') : 'el vehículo'}`
    case 'cambio_estado':
      return `${quien} cambió el estado de ${d.de} a ${d.a}`
    case 'peritaje':
      return `${quien} ${d.editado ? 'editó un' : 'cargó un'} peritaje`
    case 'gestoria':
      return `${quien} actualizó la gestoría`
    case 'archivado':
      return `${quien} ${d.archivado === false ? 'desarchivó' : 'archivó'} el vehículo`
    case 'foto':
      return `${quien} agregó una foto`
    default:
      return `${quien} — ${ev.tipo}`
  }
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
