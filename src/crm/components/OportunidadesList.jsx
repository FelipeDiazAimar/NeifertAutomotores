import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import CompatBar from './CompatBar'
import DetalleCompatModal from './DetalleCompatModal'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { lineaSpecs, precioFmt } from '@/crm/lib/formatVehiculo'
import { lineaInteres, waContactoLink } from '@/crm/lib/formatCliente'

const PASO = 20

export default function OportunidadesList({ items = [] }) {
  const [limite, setLimite] = useState(PASO)
  const [detalle, setDetalle] = useState(null) // { cliente, vehiculo, resultado }

  if (items.length === 0) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="font-display font-bold text-ink">No hay oportunidades</p>
        <p className="mt-1 text-sm text-ink-3">Cargá clientes con su interés y vehículos disponibles.</p>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 lg:grid-cols-2">
      {items.slice(0, limite).map(({ vehiculo: v, clientes }) => {
        const portada = v.fotos?.find((f) => f.es_portada) ?? v.fotos?.[0]
        const precio = precioFmt(v)
        return (
          <GlassCard key={v.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-neifert/10">
                {portada ? (
                  <img src={portada.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-neifert">{v.patente || 'S/FOTO'}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">
                  {v.marca} {v.modelo} {v.version}
                </p>
                <p className="truncate text-xs text-ink-3">{lineaSpecs(v)}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-ink">
                {precio.monto} <span className="text-xs font-normal text-ink-3">{precio.moneda}</span>
              </p>
            </div>

            <ul className="mt-3 divide-y divide-line border-t border-line">
              {clientes.map(({ cliente: c, score, bucket, detalle: det }) => {
                const wa = waContactoLink(c)
                return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link to={`/crm/clientes/${c.id}`} className="text-sm font-medium text-ink hover:text-neifert">
                      {c.nombre}
                    </Link>
                    <p className="truncate text-xs text-ink-3">{lineaInteres(c)}</p>
                  </div>
                  <CompatBar score={score} bucket={bucket} />
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Contactar a ${c.nombre} por WhatsApp`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-whatsapp px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <WhatsAppIcon size={14} /> WhatsApp
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="glass"
                    icon={Eye}
                    onClick={() => setDetalle({ cliente: c, vehiculo: v, resultado: { score, bucket, detalle: det } })}
                  >
                    Detalle
                  </Button>
                </li>
                )
              })}
            </ul>
          </GlassCard>
        )
      })}
      </div>

      {limite < items.length && (
        <div className="flex justify-center">
          <Button variant="glass" onClick={() => setLimite((l) => l + PASO)}>
            Ver más ({items.length - limite})
          </Button>
        </div>
      )}

      <DetalleCompatModal
        open={Boolean(detalle)}
        onClose={() => setDetalle(null)}
        cliente={detalle?.cliente}
        vehiculo={detalle?.vehiculo}
        resultado={detalle?.resultado}
      />
    </div>
  )
}
