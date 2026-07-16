import { useState } from 'react'
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
import { useVehicles } from '@/hooks/useVehicles'

export default function CatalogPage() {
  const { data: vehicles = [], isLoading } = useVehicles()
  const [visible, setVisible] = useState(8)
  const shown = vehicles.slice(0, visible)

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <div className="mb-4 flex justify-center">
        <span className="rounded-full bg-neifert px-4 py-1 text-xs font-semibold text-white shadow-glow-red">
          Inventario Premium
        </span>
      </div>

      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neifert">
            — Stock Disponible
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight text-ink md:text-5xl">
            Encontrá tu próximo <span className="text-ink-3">destino.</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                url: '/catalogo?ref=share',
                title: 'Catálogo — Neifert Automotores',
                text: 'Mirá el catálogo de vehículos de Neifert Automotores.',
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
          <VehicleGrid vehicles={shown} />
        )}
      </div>

      {!isLoading && vehicles.length > 0 && (
        <div className="mt-12 text-center">
          <p className="text-sm text-ink-3">
            Mostrando {shown.length} de {vehicles.length} vehículos exclusivos
          </p>
          {visible < vehicles.length && (
            <Button
              variant="glass"
              className="mt-4"
              onClick={() => setVisible((v) => v + 8)}
            >
              Cargar más unidades
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
