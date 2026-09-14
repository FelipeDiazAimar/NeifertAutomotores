import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, Plus, Share2, Link2, Eye, EyeOff } from 'lucide-react'
import Badge from '@/components/common/Badge'
import EstadoStrip from './EstadoStrip'
import VehiculoThumb from './VehiculoThumb'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'
import { shareOrCopy } from '@/lib/share'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const HEADERS = ['Vehículo', 'Patente', 'Año', 'Km', 'Precio', 'Estado', 'Web', 'Peritaje', 'Gestoría']
const ESTADOS = ['disponible', 'reservado', 'vendido', 'baja']
const kmFmt = new Intl.NumberFormat('es-AR')

const GESTORIA_LABEL = { sin_iniciar: 'Sin iniciar', en_proceso: 'En proceso', completo: 'Completo' }

function CargarBtn({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink/25 px-2.5 py-1 text-xs font-semibold text-ink-3 transition-colors hover:border-neifert hover:text-neifert"
    >
      <Plus size={13} />
      Cargar
    </button>
  )
}

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
      className="grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-ink"
    >
      <Icon size={14} />
    </button>
  )
}

async function copiarEnlace(v) {
  const url = `${window.location.origin}/catalogo/${v.id}`
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copiado al portapapeles')
  } catch {
    toast.error('No se pudo copiar el link')
  }
}

export default function VehiculoTable({ filas, onCambiarEstado, onCambiarPublicado }) {
  const navigate = useNavigate()

  return (
    <div className="glass overflow-x-auto rounded-[20px] shadow-glass">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {HEADERS.map((h) => (
              <th key={h} className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((v) => {
            const per = v.peritajes?.[0]
            const precio = precioFmt(v)
            return (
              <tr
                key={v.id}
                onClick={() => navigate(`/crm/vehiculos/${v.id}`)}
                className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <VehiculoThumb fotos={v.fotos} />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {v.marca} {v.modelo}
                      </p>
                      <p className="text-xs text-ink-3">{v.version || lineaSpecs(v)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-2">{v.patente || '—'}</td>
                <td className="px-4 py-3 text-ink-2">{v.anio || '—'}</td>
                <td className="px-4 py-3 text-ink-2">{v.km != null ? kmFmt.format(v.km) : '—'}</td>
                <td className="px-4 py-3 font-semibold text-ink">
                  {precio.monto} <span className="text-xs font-normal text-ink-3">{precio.moneda}</span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Estado de ${v.modelo}`}
                      className="inline-flex items-center gap-1"
                    >
                      <Badge variant={estadoVariant(v.estado)}>{v.estado}</Badge>
                      <ChevronDown size={13} className="text-ink-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="crm-root">
                      {ESTADOS.map((e) => (
                        <DropdownMenuItem key={e} onClick={() => onCambiarEstado(v, e)} disabled={e === v.estado}>
                          {e}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Badge variant={v.publicado ? 'green' : 'neutral'}>
                      {v.publicado ? 'Publicado' : 'Oculto'}
                    </Badge>
                    <IconBtn
                      icon={Share2}
                      label="Compartir"
                      onClick={() =>
                        shareOrCopy({ url: `/catalogo/${v.id}`, title: `${v.marca} ${v.modelo}` })
                      }
                    />
                    <IconBtn icon={Link2} label="Copiar enlace" onClick={() => copiarEnlace(v)} />
                    <IconBtn
                      icon={v.publicado ? EyeOff : Eye}
                      label={v.publicado ? 'Ocultar al público' : 'Mostrar al público'}
                      onClick={() => onCambiarPublicado(v, !v.publicado)}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {per ? (
                    <div className="w-24">
                      <EstadoStrip ok={per.items_ok} obs={per.items_obs} falta={per.items_falta} />
                    </div>
                  ) : (
                    <CargarBtn
                      label={`Cargar peritaje de ${v.marca} ${v.modelo}`}
                      onClick={() => navigate(`/crm/vehiculos/${v.id}?tab=peritaje`)}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  {v.gestoria ? (
                    <Badge variant={v.gestoria.estado === 'completo' ? 'green' : 'amber'}>
                      {GESTORIA_LABEL[v.gestoria.estado] ?? v.gestoria.estado}
                    </Badge>
                  ) : (
                    <CargarBtn
                      label={`Cargar gestoría de ${v.marca} ${v.modelo}`}
                      onClick={() => navigate(`/crm/vehiculos/${v.id}?tab=gestoria`)}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
