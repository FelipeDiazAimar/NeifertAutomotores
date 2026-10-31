import { useState } from 'react'
import Spinner from '@/components/common/Spinner'
import { useKpis, useDemanda, useOportunidades } from '@/crm/hooks/useDashboard'
import KpiTile from '@/crm/components/KpiTile'
import GraficoMarcas from '@/crm/components/GraficoMarcas'
import GraficoTipos from '@/crm/components/GraficoTipos'
import OportunidadesList from '@/crm/components/OportunidadesList'
import BuscadorCompradores from '@/crm/components/BuscadorCompradores'
import { cn } from '@/lib/cn'

const nf = new Intl.NumberFormat('es-AR')
const nfCompacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })

function Seccion({ cargando, children }) {
  if (cargando) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner size={24} />
      </div>
    )
  }
  return children
}

export default function DashboardPage() {
  const { data: kpis, isLoading: cargandoKpis } = useKpis()
  const { data: demanda, isLoading: cargandoDemanda } = useDemanda()
  const { data: oportunidades, isLoading: cargandoOps } = useOportunidades()
  const [vistaOps, setVistaOps] = useState('stock')

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Panel</h1>

      <Seccion cargando={cargandoKpis}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile label="Clientes activos" valor={nf.format(kpis?.clientesActivos ?? 0)} sub="en seguimiento" />
          <KpiTile label="Vehículos disponibles" valor={nf.format(kpis?.vehiculosDisponibles ?? 0)} sub="en stock" />
          <KpiTile
            label="Valor del stock"
            valor={`$ ${nfCompacto.format(Math.round(kpis?.valorStock?.ars ?? 0))}`}
            title={`$ ${nf.format(Math.round(kpis?.valorStock?.ars ?? 0))}`}
            sub={kpis?.valorStock?.usd ? `+ US$ ${nf.format(Math.round(kpis.valorStock.usd))}` : 'disponible'}
          />
          <KpiTile
            label="Alertas activas"
            valor={nf.format(kpis?.alertasActivas ?? 0)}
            sub={`${kpis?.vendidosMes ?? 0} veh. vendidos`}
          />
        </div>
      </Seccion>

      <Seccion cargando={cargandoDemanda}>
        <div className="grid gap-4 lg:grid-cols-2">
          <GraficoMarcas datos={demanda?.marcas ?? []} />
          <GraficoTipos datos={demanda?.tipos ?? []} />
        </div>
      </Seccion>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">Oportunidades de venta</h2>
          <div className="glass flex gap-1 rounded-2xl p-1">
            {[
              ['stock', 'Por vehículo del stock'],
              ['buscar', 'Buscar compradores'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVistaOps(id)}
                className={cn(
                  'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                  vistaOps === id ? 'bg-neifert text-white' : 'text-ink-2 hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {vistaOps === 'stock' ? (
          <Seccion cargando={cargandoOps}>
            <OportunidadesList items={oportunidades ?? []} />
          </Seccion>
        ) : (
          <BuscadorCompradores />
        )}
      </section>
    </div>
  )
}
