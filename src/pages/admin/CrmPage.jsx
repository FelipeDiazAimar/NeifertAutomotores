import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Users, TrendingUp, ClipboardList, Search } from 'lucide-react'
import KpiCard from '@/components/crm/KpiCard'
import LeadForm from '@/components/crm/LeadForm'
import Spinner from '@/components/common/Spinner'
import Pagination from '@/components/common/Pagination'
import Select from '@/components/common/Select'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import {
  useClientes,
  useClienteMutations,
  useResumenClientes,
  useProspectosSinCliente,
} from '@/crm/hooks/useClientes'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import ClienteTable from '@/crm/components/ClienteTable'
import ClienteCard from '@/crm/components/ClienteCard'
import { CANAL_OPCIONES } from '@/crm/lib/formatCliente'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 10

const ORIGIN_OPTIONS = [{ id: 'todos', label: 'Todos los orígenes' }, ...CANAL_OPCIONES]

// Filtro rápido → estados del cliente (null = todos).
const FILTROS_RAPIDOS = [
  { id: 'todos', label: 'Todos', status: null },
  { id: 'activos', label: 'Activos', status: ['activo'] },
  { id: 'seguimiento', label: 'En seguimiento', status: ['en_seguimiento'] },
  { id: 'cerrados', label: 'Vendidos / perdidos', status: ['vendido', 'perdido'] },
]

export default function CrmPage() {
  const esDesktop = useIsDesktop()
  const { cambiarStatus } = useClienteMutations()
  const { data: resumen } = useResumenClientes()
  const { data: sinCliente = [] } = useProspectosSinCliente()
  useCrmRealtime('clientes', ['crm', 'clientes'])

  const [mobileTab, setMobileTab] = useState('registrar')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [canal, setCanal] = useState('todos')
  const [rapido, setRapido] = useState('todos')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const filtros = {
    status: FILTROS_RAPIDOS.find((f) => f.id === rapido)?.status ?? undefined,
    canal: canal !== 'todos' ? [canal] : undefined,
  }
  const { data, isLoading } = useClientes({
    busqueda,
    filtros,
    orden: { campo: 'creado_en', dir: 'desc' },
    pagina,
    pageSize: PAGE_SIZE,
  })
  const filas = data?.filas ?? []
  const totalPaginas = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  const total = resumen?.total ?? 0
  const conversion = total ? (((resumen?.vendidos ?? 0) / total) * 100).toFixed(1) : '0'

  // Al cambiar un filtro se vuelve a la primera página.
  const cambiar = (setter) => (v) => {
    setter(v)
    setPagina(1)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-neifert px-4 py-1.5 text-sm font-semibold text-white shadow-glow-red">
          Gestión de Salón
        </span>
        {/* KPIs a la derecha del chip; si no entran, bajan a su propia fila. */}
        <div className="grid min-w-0 flex-1 basis-[30rem] grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiCard icon={UserPlus} accent="red" label="Cargados Hoy" value={resumen?.hoy ?? 0} />
          <KpiCard icon={Users} accent="blue" label="Activos" value={resumen?.activos ?? 0} />
          <KpiCard icon={TrendingUp} accent="green" label="Conversión" value={`${conversion}%`} />
          <KpiCard icon={ClipboardList} accent="amber" label="Total Clientes" value={total} />
        </div>
        <span className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          Abierto ahora
        </span>
      </header>

      <div className="glass grid grid-cols-2 gap-1 rounded-2xl p-1 md:hidden">
        {[
          ['registrar', 'Registrar', UserPlus],
          ['leads', 'Clientes', ClipboardList],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setMobileTab(id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors',
              mobileTab === id ? 'bg-neifert text-white' : 'text-ink-2'
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <div className={cn(mobileTab !== 'registrar' && 'hidden md:block')}>
          <LeadForm />
        </div>

        <div className={cn('space-y-4', mobileTab !== 'leads' && 'hidden md:block')}>
          {sinCliente.length > 0 && (
            <details className="glass rounded-2xl px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {sinCliente.length} consulta{sinCliente.length === 1 ? '' : 's'} sin pasar a cliente
                <span className="ml-2 text-xs font-normal text-ink-3">
                  (formulario web y leads viejos — al abrirlas se crea el cliente)
                </span>
              </summary>
              <ul className="mt-3 divide-y divide-line">
                {sinCliente.slice(0, 20).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {p.nombre_completo}
                      <span className="ml-2 text-xs text-ink-3">{p.telefono}</span>
                    </span>
                    <Link
                      to={`/admin/crm/${p.id}`}
                      className="shrink-0 text-xs font-semibold text-neifert hover:underline"
                    >
                      Abrir
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <h2 className="font-display text-xl font-bold text-ink">Clientes Recientes</h2>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="glass field-glass flex h-10 flex-1 items-center gap-2 rounded-xl px-3">
              <Search size={16} className="shrink-0 text-ink-3" />
              <input
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value)
                  setPagina(1)
                }}
                placeholder="Buscar por nombre, teléfono o localidad…"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <div className="w-full shrink-0 sm:w-56">
              <Select size="sm" value={canal} onChange={cambiar(setCanal)} options={ORIGIN_OPTIONS} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTROS_RAPIDOS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => cambiar(setRapido)(f.id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  rapido === f.id ? 'bg-neifert text-white' : 'glass text-ink-2 hover:text-ink'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : filas.length === 0 ? (
            <div className="glass grid place-items-center rounded-[20px] py-16 text-center text-ink-2">
              No hay clientes para este filtro.
            </div>
          ) : (
            <>
              {esDesktop ? (
                <ClienteTable
                  filas={filas}
                  onCambiarStatus={(c, s) => cambiarStatus.mutate({ id: c.id, de: c.status, a: s })}
                />
              ) : (
                <div className="space-y-3">
                  {filas.map((c) => (
                    <ClienteCard key={c.id} cliente={c} />
                  ))}
                </div>
              )}
              <Pagination page={pagina} totalPages={totalPaginas} onChange={setPagina} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
