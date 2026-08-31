import { useNavigate } from 'react-router-dom'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import EstadoStrip from './EstadoStrip'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'

export default function VehiculoCard({ vehiculo: v }) {
  const navigate = useNavigate()
  const per = v.peritajes?.[0]
  const precio = precioFmt(v)
  const portada = v.fotos?.find((f) => f.es_portada) ?? v.fotos?.[0]

  return (
    <GlassCard
      as="button"
      onClick={() => navigate(`/crm/vehiculos/${v.id}`)}
      className="flex w-full gap-3 p-3 text-left"
    >
      <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-neifert/10">
        {portada ? (
          <img src={portada.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold tracking-wide text-neifert">{v.patente || 'S/FOTO'}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold text-ink">
            {v.marca} {v.modelo}
          </p>
          <Badge variant={estadoVariant(v.estado)}>{v.estado}</Badge>
        </div>
        <p className="truncate text-xs text-ink-3">{v.version || lineaSpecs(v)}</p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {precio.monto} <span className="text-xs font-normal text-ink-3">{precio.moneda}</span>
        </p>
        {per && (
          <div className="mt-1.5">
            <EstadoStrip ok={per.items_ok} obs={per.items_obs} falta={per.items_falta} />
          </div>
        )}
      </div>
    </GlassCard>
  )
}
