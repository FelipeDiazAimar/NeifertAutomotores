import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import Pagination from '@/components/common/Pagination'
import GlassCard from '@/components/common/GlassCard'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useClientes, useClienteMutations } from '@/crm/hooks/useClientes'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useClientesFiltros } from '@/crm/store/useClientesFiltros'
import ClienteFilters from '@/crm/components/ClienteFilters'
import ClienteTable from '@/crm/components/ClienteTable'
import ClienteCard from '@/crm/components/ClienteCard'
import ClienteFormModal from '@/crm/components/ClienteFormModal'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 20

export default function ClientesListPage() {
  const navigate = useNavigate()
  const esDesktop = useIsDesktop()
  const { busqueda, filtros, orden, pagina, setBusqueda, setPagina } = useClientesFiltros()
  const filtrosActivos = useClientesFiltros((s) => s.contarFiltrosActivos())
  const [texto, setTexto] = useState(busqueda)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [abrirNuevo, setAbrirNuevo] = useState(false)
  const { cambiarStatus } = useClienteMutations()

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto, setBusqueda])

  useCrmRealtime('clientes', ['crm', 'clientes'])

  const opts = { busqueda, filtros, orden, pagina, pageSize: PAGE_SIZE, incluirArchivados: filtros.incluirArchivados }
  const { data, isLoading } = useClientes(opts)
  const filas = data?.filas ?? []
  const total = data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Clientes</h1>
          <p className="text-sm text-ink-3">{total} en cartera</p>
        </div>
        <Button icon={Plus} onClick={() => setAbrirNuevo(true)}>
          Cargar cliente
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="glass field-glass flex h-12 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, teléfono o localidad…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          aria-expanded={mostrarFiltros}
          className={cn(
            'glass flex h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors',
            mostrarFiltros || filtrosActivos > 0 ? 'text-neifert' : 'text-ink-2 hover:text-ink',
          )}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filtros</span>
          {filtrosActivos > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {mostrarFiltros && <ClienteFilters />}

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filas.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay clientes que coincidan</p>
          <p className="mt-1 text-sm text-ink-3">Probá quitar filtros o cargá un cliente nuevo.</p>
          <Button icon={Plus} className="mt-4" onClick={() => setAbrirNuevo(true)}>
            Cargar cliente
          </Button>
        </GlassCard>
      ) : esDesktop ? (
        <ClienteTable
          filas={filas}
          onCambiarStatus={(c, s) => cambiarStatus.mutate({ id: c.id, de: c.status, a: s })}
        />
      ) : (
        <div className="space-y-2">
          {filas.map((c) => (
            <ClienteCard key={c.id} cliente={c} />
          ))}
        </div>
      )}

      <Pagination page={pagina} totalPages={totalPaginas} onChange={setPagina} />

      <ClienteFormModal
        open={abrirNuevo}
        onClose={() => setAbrirNuevo(false)}
        onCreado={(fila) => navigate(`/crm/clientes/${fila.id}`)}
      />
    </div>
  )
}
