import { useState } from 'react'
import { Pencil, ChevronDown, Archive, Trash2, Sparkles, Globe } from 'lucide-react'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import Modal from '@/components/common/Modal'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'
import { cn } from '@/lib/cn'
import { useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import VehiculoForm from './VehiculoForm'
import VehiculoFotoCarousel from './VehiculoFotoCarousel'
import VehiculoFotosGaleria from './VehiculoFotosGaleria'
import VehiculoStats from './VehiculoStats'

// Campos que el form maneja (sin id/auditoría/estado). es_nuevo/publicado
// quedaron afuera: se manejan como acciones directas, no como campos del form.
const CAMPOS_FORM = [
  'marca', 'modelo', 'version', 'patente', 'tipo', 'anio', 'km', 'transmision', 'color',
  'moneda', 'precio_contado', 'precio_canje', 'duenio_nombre', 'duenio_apellido',
  'duenio_contacto', 'itv', 'itv_venc', 'consignacion', 'tipo_consignacion', 'origen',
  'carpeta_completa', 'carpeta_con_oficio', 'carpeta_entregada', 'tiene_iva', 'nota',
  'categoria', 'descripcion', 'combustible', 'precio_usd',
]

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
  const { actualizar } = useVehiculoMutations()
  const precio = precioFmt(v)
  const inicialForm = Object.fromEntries(CAMPOS_FORM.map((k) => [k, v[k] ?? undefined]))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <GlassCard className="overflow-hidden">
          <div className="relative">
            <VehiculoFotoCarousel vehiculoId={v.id} patente={v.patente} />
            <div className="pointer-events-none absolute right-3 top-3">
              <Badge
                variant={estadoVariant(v.estado)}
                className={cn(
                  'shadow-glass',
                  estadoVariant(v.estado) === 'green' && 'bg-success text-white',
                  estadoVariant(v.estado) === 'amber' && 'bg-amber text-white',
                  estadoVariant(v.estado) === 'red' && 'bg-neifert text-white',
                  estadoVariant(v.estado) === 'neutral' && 'bg-ink text-white',
                )}
              >
                {v.estado}
              </Badge>
            </div>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">
                  {v.marca} {v.modelo}
                </h2>
                <p className="text-sm text-ink-3">{v.version}</p>
                <p className="mt-1 text-sm text-ink-2">{lineaSpecs(v)}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold text-ink">
                  {precio.monto} <span className="text-sm font-normal text-ink-3">{precio.moneda}</span>
                </p>
                <div className="mt-1">
                  <VehiculoStats vehiculoId={v.id} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {v.itv === 'si' && <Badge variant="green">ITV al día</Badge>}
              {v.consignacion && <Badge variant="amber">Consignación</Badge>}
              {v.tiene_iva && <Badge variant="neutral">IVA</Badge>}
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => setEditando((e) => !e)}
                className={cn(
                  'glass inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors sm:w-auto',
                  editando ? 'text-neifert' : 'text-ink hover:border-ink/30',
                )}
              >
                <Pencil size={16} /> {editando ? 'Cerrar edición' : 'Editar'}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Cambiar estado" className="inline-flex w-full sm:w-auto">
                  <span className="glass inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-ink sm:w-auto">
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
              <Button variant="ghost" icon={Archive} onClick={onArchivar} className="w-full sm:w-auto">
                Archivar
              </Button>
              <button
                type="button"
                onClick={() => actualizar.mutate({ id: v.id, data: { es_nuevo: !v.es_nuevo } })}
                className={cn(
                  'glass inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors sm:w-auto',
                  v.es_nuevo ? 'text-neifert' : 'text-ink-2 hover:text-ink',
                )}
              >
                <Sparkles size={16} /> Es nuevo
              </button>
              <button
                type="button"
                onClick={() => actualizar.mutate({ id: v.id, data: { publicado: !v.publicado } })}
                className={cn(
                  'glass inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors sm:w-auto',
                  v.publicado ? 'text-neifert' : 'text-ink-2 hover:text-ink',
                )}
              >
                <Globe size={16} /> {v.publicado ? 'Publicado en la web' : 'Publicar en la web'}
              </button>
              {puedeEliminar && (
                <Button variant="outline" icon={Trash2} onClick={() => setConfirmar(true)} className="w-full sm:w-auto">
                  Eliminar
                </Button>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="self-start p-3">
          <VehiculoFotosGaleria vehiculoId={v.id} />
        </GlassCard>
      </div>

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

      {editando && (
        <GlassCard className="p-5">
          <h3 className="mb-4 font-display text-sm font-bold text-ink">Editar vehículo</h3>
          <VehiculoForm
            inicial={inicialForm}
            guardando={actualizar.isPending}
            onGuardar={(data) => actualizar.mutate({ id: v.id, data }, { onSuccess: () => setEditando(false) })}
          />
        </GlassCard>
      )}

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
    </div>
  )
}
