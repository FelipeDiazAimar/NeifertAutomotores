import Spinner from '@/components/common/Spinner'
import { useKpis, useDemanda, useOportunidades } from '@/crm/hooks/useDashboard'
import KpiTile from '@/crm/components/KpiTile'
import GraficoMarcas from '@/crm/components/GraficoMarcas'
import GraficoTipos from '@/crm/components/GraficoTipos'
import OportunidadesList from '@/crm/components/OportunidadesList'

const nf = new Intl.NumberFormat('es-AR')

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

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Panel</h1>

      <Seccion cargando={cargandoKpis}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile label="Clientes activos" valor={nf.format(kpis?.clientesActivos ?? 0)} sub="en seguimiento" />
          <KpiTile label="Vehículos disponibles" valor={nf.format(kpis?.vehiculosDisponibles ?? 0)} sub="en stock" />
          <KpiTile
            label="Valor del stock"
            valor={`$ ${nf.format(Math.round(kpis?.valorStock?.ars ?? 0))}`}
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
        <h2 className="mb-3 font-display text-lg font-bold text-ink">Oportunidades de venta</h2>
        <Seccion cargando={cargandoOps}>
          <OportunidadesList items={oportunidades ?? []} />
        </Seccion>
      </section>
    </div>
  )
}
