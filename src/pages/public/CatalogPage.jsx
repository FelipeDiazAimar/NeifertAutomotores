import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Share2 } from 'lucide-react'
import CategoryFilter from '@/components/catalog/CategoryFilter'
import SortDropdown from '@/components/catalog/SortDropdown'
import ViewToggle from '@/components/catalog/ViewToggle'
import CatalogSearch from '@/components/catalog/CatalogSearch'
import FilterPanel from '@/components/catalog/FilterPanel'
import VehicleGrid from '@/components/catalog/VehicleGrid'
import Spinner from '@/components/common/Spinner'
import Button from '@/components/common/Button'
import { shareOrCopy } from '@/lib/share'
import { trackShareClick } from '@/lib/vehicleClicks'
import { trackEvent } from '@/services/events.service'
import { detectSource } from '@/lib/provenance'
import { groupVehiclesByBrand, paginarPorMarcas, shouldGroupByBrand } from '@/lib/brandGroups'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useVehicles } from '@/hooks/useVehicles'

const VARIANT_COPY = {
  usados: {
    condition: 'usados',
    basePath: '/catalogo',
    badge: 'Inventario Premium',
    eyebrow: '— Stock Disponible',
    titleA: 'Encontrá tu próximo',
    titleB: 'destino.',
    shareTitle: 'Catálogo Usados — Neifert Automotores',
    shareText: 'Mirá el catálogo de usados de Neifert Automotores.',
    countLabel: 'vehículos exclusivos',
    emptyText: 'No encontramos usados con esos filtros.',
  },
  cero: {
    condition: 'cero',
    basePath: '/catalogo-0km',
    badge: 'Unidades 0 km',
    eyebrow: '— Nuevos, directo a patentar',
    titleA: 'Estrená tu próximo',
    titleB: '0 kilómetro.',
    shareTitle: 'Catálogo 0 km — Neifert Automotores',
    shareText: 'Mirá el catálogo 0 km de Neifert Automotores.',
    countLabel: 'unidades 0 km',
    emptyText: 'Todavía no hay unidades 0 km con esos filtros.',
  },
}

const MAX_AUTOS_POR_PAGINA = 20

export default function CatalogPage({ variant = 'usados' }) {
  const copy = VARIANT_COPY[variant] || VARIANT_COPY.usados
  const { data: vehicles = [], isLoading } = useVehicles(copy.condition)
  const category = useCatalogStore((s) => s.category)
  const sort = useCatalogStore((s) => s.sort)
  const search = useCatalogStore((s) => s.search)
  const filters = useCatalogStore((s) => s.filters)
  const agrupar = shouldGroupByBrand(sort)
  // Con brand-asc: páginas por marcas enteras (~20 autos). Si no, plano.
  const [paginasVisibles, setPaginasVisibles] = useState(1)
  const groups = useMemo(
    () => (agrupar ? groupVehiclesByBrand(vehicles) : []),
    [vehicles, agrupar]
  )
  const paginas = useMemo(
    () => (agrupar ? paginarPorMarcas(groups, MAX_AUTOS_POR_PAGINA) : []),
    [groups, agrupar]
  )
  const shownGroups = agrupar ? paginas.slice(0, paginasVisibles).flat() : []
  const flatShown = agrupar ? [] : vehicles.slice(0, paginasVisibles * MAX_AUTOS_POR_PAGINA)
  const shown = agrupar ? shownGroups.flatMap(([, items]) => items) : flatShown
  const shownCount = agrupar
    ? shownGroups.reduce((n, [, items]) => n + items.length, 0)
    : flatShown.length
  const hayMas = agrupar
    ? paginasVisibles < paginas.length
    : flatShown.length < vehicles.length

  // Al cambiar filtros/búsqueda/orden se vuelve a la primera página.
  const queryKey = JSON.stringify({ category, sort, search, filters, condition: copy.condition })
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey)
  if (queryKey !== prevQueryKey) {
    setPrevQueryKey(queryKey)
    setPaginasVisibles(1)
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <div className="mb-4 flex justify-center">
        <span className="rounded-full bg-neifert px-4 py-1 text-xs font-semibold text-white shadow-glow-red">
          {copy.badge}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neifert">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight text-ink md:text-5xl">
            {copy.titleA}
            <br />
            <span className="text-ink-3">{copy.titleB}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
          <CatalogSearch />
          <FilterPanel />
          <ViewToggle />
          <SortDropdown />
          <motion.button
            type="button"
            onClick={() => {
              trackShareClick({ kind: 'catalog' })
              trackEvent(null, 'compartir', detectSource())
              shareOrCopy({
                url: `${copy.basePath}?ref=share`,
                title: copy.shareTitle,
                text: copy.shareText,
              })
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Compartir catálogo"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full glass text-ink transition-colors hover:text-neifert"
          >
            <Share2 size={18} />
          </motion.button>
        </div>
      </div>

      <div className="mt-6">
        <CategoryFilter />
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Spinner size={32} />
          </div>
        ) : (
          <VehicleGrid vehicles={shown} basePath={copy.basePath} emptyText={copy.emptyText} agrupar={agrupar} />
        )}
      </div>

      {!isLoading && vehicles.length > 0 && (
        <div className="mt-4 text-center sm:mt-12">
          {agrupar ? (
            <p className="text-sm text-ink-3">
              Mostrando {shownGroups.length} de {groups.length}{' '}
              {groups.length === 1 ? 'marca' : 'marcas'} · {shownCount} de{' '}
              {vehicles.length} {copy.countLabel}
            </p>
          ) : (
            <p className="text-sm text-ink-3">
              Mostrando {shownCount} de {vehicles.length} {copy.countLabel}
            </p>
          )}
          {hayMas && (
            <Button
              variant="glass"
              className="mt-4"
              onClick={() => setPaginasVisibles((v) => v + 1)}
            >
              {agrupar ? 'Cargar más marcas' : 'Cargar más'}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
