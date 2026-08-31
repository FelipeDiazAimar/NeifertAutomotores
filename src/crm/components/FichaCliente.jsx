import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, ChevronDown, Archive, Trash2, Handshake } from 'lucide-react'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import Modal from '@/components/common/Modal'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { lineaInteres, statusVariant, canalLabel } from '@/crm/lib/formatCliente'

const STATUS = ['activo', 'en_seguimiento', 'vendido', 'perdido']
const nf = new Intl.NumberFormat('es-AR')

function Dato({ k, children }) {
  if (!children) return null
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-3">{k}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}

export default function FichaCliente({ cliente: c, puedeEliminar, onCambiarStatus, onArchivar, onEliminar, onRegistrarVenta }) {
  const [confirmar, setConfirmar] = useState(false)

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">{c.nombre}</h2>
            <p className="text-sm text-ink-3">{c.telefono || 'sin teléfono'}</p>
          </div>
          {c.presupuesto ? (
            <div className="text-right">
              <p className="font-display text-lg font-bold text-ink">$ {nf.format(c.presupuesto)}</p>
              <p className="text-xs text-ink-3">presupuesto</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
          <Badge variant="neutral">{canalLabel(c.canal)}</Badge>
          {c.interes_cero_km && <Badge variant="amber">Interés 0 km</Badge>}
          {c.tiene_auto_entrega && <Badge variant="neutral">Auto en entrega</Badge>}
        </div>

        <p className="text-sm text-ink-2">{lineaInteres(c)}</p>

        <dl className="grid gap-4 pt-1 sm:grid-cols-3">
          <Dato k="Localidad">{c.localidad}</Dato>
          <Dato k="Cumpleaños">{c.fecha_cumple}</Dato>
          <Dato k="Fecha de venta">{c.fecha_venta}</Dato>
        </dl>
        {c.notas && (
          <div className="border-t border-line pt-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">Notas</p>
            <p className="text-sm text-ink">{c.notas}</p>
          </div>
        )}
      </GlassCard>

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/crm/clientes/${c.id}/editar`}
          className="glass inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
        >
          <Pencil size={17} /> Editar
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Cambiar status" className="inline-flex">
            <span className="glass inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-ink">
              Cambiar status <ChevronDown size={15} />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="crm-root">
            {STATUS.map((s) => (
              <DropdownMenuItem key={s} disabled={s === c.status} onClick={() => onCambiarStatus(s)}>
                {s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {c.status !== 'vendido' && (
          <Button variant="primary" icon={Handshake} onClick={onRegistrarVenta}>
            Registrar venta
          </Button>
        )}
        <Button variant="ghost" icon={Archive} onClick={onArchivar}>
          Archivar
        </Button>
        {puedeEliminar && (
          <Button variant="outline" icon={Trash2} onClick={() => setConfirmar(true)}>
            Eliminar
          </Button>
        )}
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Eliminar cliente">
        <p className="text-sm text-ink-2">
          Se borra definitivamente {c.nombre} y su historial. Esta acción no se puede deshacer.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmar(false)
              onEliminar()
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
