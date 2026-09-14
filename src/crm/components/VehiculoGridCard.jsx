import { useNavigate } from 'react-router-dom'
import { ChevronDown, Share2, Link2, Eye, EyeOff } from 'lucide-react'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import VehiculoStats from './VehiculoStats'
import { copiarEnlace } from './VehiculoTable'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'
import { shareOrCopy } from '@/lib/share'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const ESTADOS = ['disponible', 'reservado', 'vendido', 'baja']

function IconBtn({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-ink"
    >
      <Icon size={14} />
    </button>
  )
}

/** Tarjeta de vehículo para la vista en grilla de /crm/vehiculos (alternativa
 *  a VehiculoTable). Mismas acciones que la columna "Web" de la tabla, para
 *  que ambas vistas ofrezcan exactamente lo mismo. */
export default function VehiculoGridCard({ vehiculo: v, onCambiarEstado, onCambiarPublicado }) {
  const navigate = useNavigate()
  const precio = precioFmt(v)
  const portada = v.fotos?.find((f) => f.es_portada) ?? v.fotos?.[0]

  return (
    <GlassCard
      onClick={() => navigate(`/crm/vehiculos/${v.id}`)}
      className="cursor-pointer overflow-hidden transition-colors hover:border-ink/20"
    >
      <div className="flex gap-3 p-3">
        <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-xl bg-neifert/5">
          {portada ? (
            <img src={portada.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[9px] font-bold uppercase text-neifert/50">Sin foto</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neifert">{v.marca}</p>
          <p className="truncate font-display font-bold text-ink">
            {v.modelo}
            {v.version && <span className="font-normal text-ink-3"> {v.version}</span>}
          </p>
          <p className="text-sm font-extrabold text-ink">
            {precio.monto} <span className="text-xs font-normal text-ink-3">{precio.moneda}</span>
          </p>
          <p className="text-xs text-ink-3">{lineaSpecs(v)}</p>
        </div>
        <div className="flex h-fit shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Estado de ${v.modelo}`} className="inline-flex items-center gap-0.5">
              <Badge variant={estadoVariant(v.estado)}>{v.estado}</Badge>
              <ChevronDown size={12} className="text-ink-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="crm-root">
              {ESTADOS.map((e) => (
                <DropdownMenuItem key={e} onClick={() => onCambiarEstado(v, e)} disabled={e === v.estado}>
                  {e}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!v.publicado && <Badge variant="neutral">Oculto</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <VehiculoStats vehiculoId={v.id} variant="row" />
        <div className="flex-1" />
        <IconBtn
          icon={Share2}
          label="Compartir"
          onClick={() => shareOrCopy({ url: `/catalogo/${v.id}`, title: `${v.marca} ${v.modelo}` })}
        />
        <IconBtn icon={Link2} label="Copiar enlace" onClick={() => copiarEnlace(v)} />
        <IconBtn
          icon={v.publicado ? EyeOff : Eye}
          label={v.publicado ? 'Ocultar al público' : 'Mostrar al público'}
          onClick={() => onCambiarPublicado(v, !v.publicado)}
        />
      </div>
    </GlassCard>
  )
}
