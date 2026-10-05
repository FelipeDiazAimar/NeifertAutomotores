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
import { groupVehiclesByBrand } from '@/lib/brandGroups'
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

const BRANDS_INITIAL = 4
const BRANDS_STEP = 4

export default function CatalogPage({ variant = 'usados' }) {
  const copy = VARIANT_COPY[variant] || VARIANT_COPY.usados
  const { data: vehicles = [], isLoading } = useVehicles(copy.condition)
  // Paginación por MARCAS (no por vehículos) para no cortar nunca una
  // marca a la mitad: se muestran grupos completos.
  const [visibleBrands, setVisibleBrands] = useState(BRANDS_INITIAL)
  const groups = useMemo(() => groupVehiclesByBrand(vehicles), [vehicles])
  const shownGroups = groups.slice(0, visibleBrands)
  const shownCount = shownGroups.reduce((n, [, items]) => n + items.length, 0)
  const shown = shownGroups.flatMap(([, items]) => items)

  // Al cambiar filtros/búsqueda/orden se vuelve a la primera página de marcas.
  const category = useCatalogStore((s) => s.category)
  const sort = useCatalogStore((s) => s.sort)
  const search = useCatalogStore((s) => s.search)
  const filters = useCatalogStore((s) => s.filters)
  const queryKey = JSON.stringify({ category, sort, search, filters, condition: copy.condition })
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey)
  if (queryKey !== prevQueryKey) {
    setPrevQueryKey(queryKey)
    setVisibleBrands(BRANDS_INITIAL)
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
          <VehicleGrid vehicles={shown} basePath={copy.basePath} emptyText={copy.emptyText} />
        )}
      </div>

      {!isLoading && vehicles.length > 0 && (
        <div className="mt-4 text-center sm:mt-12">
          <p className="text-sm text-ink-3">
            Mostrando {shownGroups.length} de {groups.length}{' '}
            {groups.length === 1 ? 'marca' : 'marcas'} · {shownCount} de{' '}
            {vehicles.length} {copy.countLabel}
          </p>
          {visibleBrands < groups.length && (
            <Button
              variant="glass"
              className="mt-4"
              onClick={() => setVisibleBrands((v) => v + BRANDS_STEP)}
            >
              Cargar más marcas
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
