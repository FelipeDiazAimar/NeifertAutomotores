import { useState } from 'react'
import { Pencil, ChevronDown, Archive, Trash2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import Modal from '@/components/common/Modal'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'
import VehiculoFormModal from './VehiculoFormModal'

const ESTADOS = ['disponible', 'reservado', 'vendido', 'baja']

function Dato({ k, children }) {
  if (!children) return null
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-3">{k}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}

export default function FichaVehiculo({ vehiculo: v, onCambiarEstado, onArchivar, onEliminar, puedeEliminar }) {
  const [confirmar, setConfirmar] = useState(false)
  const [editando, setEditando] = useState(false)
  const precio = precioFmt(v)
  const portada = v.fotos?.find((f) => f.es_portada) ?? v.fotos?.[0]

  return (
    <div className="space-y-4">
      <GlassCard className="overflow-hidden">
        <div className="grid aspect-[16/7] w-full place-items-center bg-neifert/5">
          {portada ? (
            <img src={portada.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-3xl font-bold tracking-widest text-neifert/70">
              {v.patente || 'SIN FOTO'}
            </span>
          )}
        </div>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">
                {v.marca} {v.modelo}
              </h2>
              <p className="text-sm text-ink-3">{v.version}</p>
              <p className="mt-1 text-sm text-ink-2">{lineaSpecs(v)}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-ink">{precio.monto}</p>
              <p className="text-xs text-ink-3">{precio.moneda}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={estadoVariant(v.estado)}>{v.estado}</Badge>
            {v.itv === 'si' && <Badge variant="green">ITV al día</Badge>}
            {v.consignacion && <Badge variant="amber">Consignación</Badge>}
            {v.tiene_iva && <Badge variant="neutral">IVA</Badge>}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Dato k="Dueño">{[v.duenio_nombre, v.duenio_apellido].filter(Boolean).join(' ')}</Dato>
          <Dato k="Contacto">{v.duenio_contacto}</Dato>
          <Dato k="Patente">{v.patente}</Dato>
          <Dato k="Color">{v.color}</Dato>
          <Dato k="Origen">{v.origen}</Dato>
          <Dato k="Venc. ITV">{v.itv_venc}</Dato>
        </dl>
        {v.nota && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">Nota</p>
            <p className="text-sm text-ink">{v.nota}</p>
          </div>
        )}
      </GlassCard>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="glass inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
        >
          <Pencil size={17} /> Editar
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Cambiar estado" className="inline-flex">
            <span className="glass inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-ink">
              Cambiar estado <ChevronDown size={15} />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="crm-root">
            {ESTADOS.map((e) => (
              <DropdownMenuItem key={e} disabled={e === v.estado} onClick={() => onCambiarEstado(e)}>
                {e}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" icon={Archive} onClick={onArchivar}>
          Archivar
        </Button>
        {puedeEliminar && (
          <Button variant="outline" icon={Trash2} onClick={() => setConfirmar(true)}>
            Eliminar
          </Button>
        )}
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Eliminar vehículo">
        <p className="text-sm text-ink-2">
          Se borra definitivamente {v.marca} {v.modelo} y su peritaje/gestoría. Esta acción no se puede deshacer.
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

      {editando && (
        <VehiculoFormModal open vehiculo={v} onClose={() => setEditando(false)} />
      )}
    </div>
  )
}
