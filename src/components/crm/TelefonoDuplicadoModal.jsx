import { Phone } from 'lucide-react'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import { statusVariant } from '@/crm/lib/formatCliente'

const ETIQUETA = { activo: 'Activo', en_seguimiento: 'En seguimiento', vendido: 'Vendido', perdido: 'Perdido' }

const fechaAlta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—')

/** Aviso al cargar un teléfono que ya pertenece a un cliente. Cerrarlo (X,
 *  Esc o fondo) equivale a "Continuar con la carga". */
export default function TelefonoDuplicadoModal({ clientes, onVerFicha, onContinuar }) {
  const open = clientes.length > 0
  return (
    <Modal open={open} onClose={onContinuar} title="Este teléfono ya está registrado" size="sm">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <Phone size={15} className="shrink-0 text-ink-3" />
        {clientes.length === 1
          ? 'Ya hay un cliente con este número:'
          : `Hay ${clientes.length} clientes con este número:`}
      </p>
      <ul className="mt-3 space-y-2">
        {clientes.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-surface/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-ink">{c.nombre}</span>
              <Badge variant={statusVariant(c.status)}>{ETIQUETA[c.status] ?? c.status}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">
              Alta: {fechaAlta(c.creado_en)}
              {c.archivado_en ? ' · Archivado' : ''}
            </p>
            <Button size="sm" variant="glass" className="mt-2" onClick={() => onVerFicha(c)}>
              Ver ficha
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onContinuar}>
          Continuar con la carga
        </Button>
      </div>
    </Modal>
  )
}
