import { useNavigate } from 'react-router-dom'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import EstadoStrip from './EstadoStrip'
import { lineaSpecs, precioFmt, estadoVariant } from '@/crm/lib/formatVehiculo'

const GESTORIA_LABEL = { sin_iniciar: 'Sin iniciar', en_proceso: 'En proceso', completo: 'Completo' }

export default function VehiculoCard({ vehiculo: v }) {
  const navigate = useNavigate()
  const per = v.peritajes?.[0]
  const precio = precioFmt(v)
  const portada = v.fotos?.find((f) => f.es_portada) ?? v.fotos?.[0]
  const specs = lineaSpecs(v)

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
          <Badge variant={estadoVariant(v.estado)} className="shrink-0">
            {v.estado}
          </Badge>
        </div>

        {v.version && <p className="truncate text-xs text-ink-3">{v.version}</p>}
        <p className="truncate text-xs text-ink-3">{specs}</p>

        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            {precio.monto} <span className="text-xs font-normal text-ink-3">{precio.moneda}</span>
          </p>
          <p className="shrink-0 text-xs text-ink-3">{v.patente || 'Sin patente'}</p>
        </div>

        {(per || v.gestoria) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {per && (
              <div className="flex min-w-[7rem] flex-1 items-center gap-1.5">
                <span className="shrink-0 text-[11px] font-medium text-ink-3">Peritaje</span>
                <EstadoStrip ok={per.items_ok} obs={per.items_obs} falta={per.items_falta} />
              </div>
            )}
            {v.gestoria && (
              <Badge
                variant={v.gestoria.estado === 'completo' ? 'green' : 'amber'}
                className="shrink-0 px-2 py-0.5 text-[11px]"
              >
                Gestoría · {GESTORIA_LABEL[v.gestoria.estado] ?? v.gestoria.estado}
              </Badge>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
