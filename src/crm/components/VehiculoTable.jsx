import { useNavigate } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import Badge from '@/components/common/Badge'
import EstadoStrip from './EstadoStrip'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const HEADERS = ['Vehículo', 'Patente', 'Año', 'Km', 'Precio', 'Estado', 'Peritaje', 'Gestoría']
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

export default function VehiculoTable({ filas, onCambiarEstado }) {
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
                  <p className="font-semibold text-ink">
                    {v.marca} {v.modelo}
                  </p>
                  <p className="text-xs text-ink-3">{v.version || lineaSpecs(v)}</p>
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
