import { useEffect, useState } from 'react'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import Pagination from '@/components/common/Pagination'
import GlassCard from '@/components/common/GlassCard'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useVehiculos, useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useVehiculosFiltros } from '@/crm/store/useVehiculosFiltros'
import VehiculoFilters from '@/crm/components/VehiculoFilters'
import VehiculoTable from '@/crm/components/VehiculoTable'
import VehiculoCard from '@/crm/components/VehiculoCard'
import VehiculoFormModal from '@/crm/components/VehiculoFormModal'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 20

export default function VehiculosListPage() {
  const esDesktop = useIsDesktop()
  const { busqueda, filtros, orden, pagina, setBusqueda, setPagina } = useVehiculosFiltros()
  const filtrosActivos = useVehiculosFiltros((s) => s.contarFiltrosActivos())
  const [texto, setTexto] = useState(busqueda)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [abrirNuevo, setAbrirNuevo] = useState(false)
  const { cambiarEstado } = useVehiculoMutations()

  // debounce búsqueda → store
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto, setBusqueda])

  useCrmRealtime('vehiculos', ['crm', 'vehiculos'])

  const opts = {
    busqueda, filtros, orden, pagina, pageSize: PAGE_SIZE,
    incluirArchivados: filtros.incluirArchivados,
  }
  const { data, isLoading } = useVehiculos(opts)
  const filas = data?.filas ?? []
  const total = data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Vehículos</h1>
          <p className="text-sm text-ink-3">{total} en stock</p>
        </div>
        <Button icon={Plus} onClick={() => setAbrirNuevo(true)}>
          Cargar vehículo
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="glass field-glass flex h-12 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por marca, modelo, patente o dueño…"
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

      {mostrarFiltros && <VehiculoFilters />}

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filas.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay vehículos que coincidan</p>
          <p className="mt-1 text-sm text-ink-3">Probá quitar filtros o cargá un vehículo nuevo.</p>
          <Button icon={Plus} className="mt-4" onClick={() => setAbrirNuevo(true)}>
            Cargar vehículo
          </Button>
        </GlassCard>
      ) : esDesktop ? (
        <VehiculoTable
          filas={filas}
          onCambiarEstado={(v, e) => cambiarEstado.mutate({ id: v.id, de: v.estado, a: e })}
        />
      ) : (
        <div className="space-y-2">
          {filas.map((v) => (
            <VehiculoCard key={v.id} vehiculo={v} />
          ))}
        </div>
      )}

      <Pagination page={pagina} totalPages={totalPaginas} onChange={setPagina} />

      <VehiculoFormModal open={abrirNuevo} onClose={() => setAbrirNuevo(false)} />
    </div>
  )
}
