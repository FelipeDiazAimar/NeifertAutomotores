import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import VehicleCard from './VehicleCard'
import { useCatalogStore } from '@/store/useCatalogStore'
import { groupVehiclesByBrand } from '@/lib/brandGroups'
import { cn } from '@/lib/cn'

export default function VehicleGrid({ vehicles, basePath = '/catalogo', emptyText }) {
  const view = useCatalogStore((s) => s.viewMode)

  const groups = useMemo(() => groupVehiclesByBrand(vehicles), [vehicles])

  if (vehicles.length === 0) {
    return (
      <div className="glass grid place-items-center rounded-[20px] py-20 text-center">
        <p className="text-ink-2">{emptyText || 'No encontramos vehículos con esos filtros.'}</p>
      </div>
    )
  }

  // Vista lista: filas de ancho completo, encabezado por marca sin problema
  // de huecos.
  if (view !== 'grid') {
    return (
      <div className="flex flex-col gap-8 md:gap-10">
        <AnimatePresence mode="popLayout">
          {groups.map(([brand, items]) => (
            <motion.section
              key={brand}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label={`Marca ${brand}`}
            >
              <div className="mb-3 flex items-center gap-3 sm:mb-4">
                <h2 className="font-display text-lg font-extrabold uppercase tracking-widest text-ink md:text-xl">
                  {brand}
                </h2>
                <span className="rounded-full glass px-2.5 py-0.5 text-xs font-semibold text-ink-2">
                  {items.length} {items.length === 1 ? 'unidad' : 'unidades'}
                </span>
                <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
              </div>

              <motion.div layout className="flex flex-col gap-4">
                <AnimatePresence mode="popLayout">
                  {items.map((v) => (
                    <VehicleCard key={v.id} vehicle={v} view={view} basePath={basePath} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>
    )
  }

  // Vista grilla: UNA sola grilla continua, sin celdas dedicadas a la
  // marca. Cada marca se etiqueta sobre su primera card (badge con nombre
  // y cantidad): los vehículos fluyen pegados, sin huecos vacíos.
  return (
    <motion.div
      layout
      className={cn('grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4')}
    >
      <AnimatePresence mode="popLayout">
        {groups.flatMap(([brand, items]) =>
          items.map((v, i) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              view={view}
              basePath={basePath}
              groupLabel={i === 0 ? { brand, count: items.length } : null}
            />
          ))
        )}
      </AnimatePresence>
    </motion.div>
  )
}
