import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import VehicleCard from './VehicleCard'
import { useCatalogStore } from '@/store/useCatalogStore'
import { groupVehiclesByBrand } from '@/lib/brandGroups'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { EASE } from '@/lib/animations'
import { cn } from '@/lib/cn'

/** Catálogo agrupado por marca: cada vehículo ocupa 1 celda y la primera
 *  de cada marca lleva su label arriba (nombre + cantidad) con una línea
 *  continua que abarca TODOS sus autos de la primera fila. El ancho es
 *  cálculo puro (K columnas de card + K-1 gaps, según breakpoint), sin
 *  medir el DOM: nunca se desfasa. Sin spans ni reordenamientos: orden
 *  estricto y cero huecos. */
export default function VehicleGrid({ vehicles, basePath = '/catalogo', emptyText }) {
  const view = useCatalogStore((s) => s.viewMode)
  // Mismas columnas y gaps que la grilla (ver className abajo).
  const isXl = useMediaQuery('(min-width: 1280px)')
  const isLg = useMediaQuery('(min-width: 1024px)')
  const isSm = useMediaQuery('(min-width: 640px)')
  const cols = isXl ? 4 : isLg ? 3 : 2
  const gap = isSm ? 20 : 12

  const groups = useMemo(() => groupVehiclesByBrand(vehicles), [vehicles])

  if (vehicles.length === 0) {
    return (
      <div className="glass grid place-items-center rounded-[20px] py-20 text-center">
        <p className="text-ink-2">
          {emptyText || 'No encontramos vehículos con esos filtros.'}
        </p>
      </div>
    )
  }

  // Vista lista: bloques apilados a ancho completo, sin problema de huecos.
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
                <h2 className="font-display text-ink text-lg font-extrabold tracking-widest uppercase md:text-xl">
                  {brand}
                </h2>
                <span className="glass text-ink-2 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  {items.length} {items.length === 1 ? 'unidad' : 'unidades'}
                </span>
                <span className="bg-ink/10 h-px flex-1" aria-hidden="true" />
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

  // Vista grilla: grilla plana. TODAS las celdas llevan una franja de header
  // de alto fijo (así las filas quedan alineadas y no hay huecos): cada una
  // dibuja su tramo de línea, que se estira sobre el gap hasta la celda
  // siguiente si es de la misma marca y está en la misma fila. El label
  // solo va en la primera celda de cada marca.
  const offsets = groups.reduce((acc) => {
    acc.push(acc.length ? acc[acc.length - 1] + groups[acc.length - 1][1].length : 0)
    return acc
  }, [])
  return (
    <motion.div
      layout
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4'
      )}
    >
      <AnimatePresence mode="popLayout">
        {groups.flatMap(([brand, items], g) =>
          items.map((v, i) => {
            const col = (offsets[g] + i) % cols
            const tono = g % 2 === 0 ? 'bg-neifert' : 'bg-ink/50'
            const seguidaMismaFila = i < items.length - 1 && col < cols - 1
            return (
              <motion.div
                key={v.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4, ease: EASE }}
                aria-label={i === 0 ? `Marca ${brand}` : undefined}
              >
                <div className="relative mb-3 flex h-9 items-end gap-2 pb-2">
                  {i === 0 && (
                    <>
                      <p className="font-display text-ink truncate text-sm leading-none font-extrabold tracking-widest uppercase sm:text-base">
                        {brand}
                      </p>
                      <span className="text-ink-3 shrink-0 text-[11px] leading-none font-semibold">
                        {items.length}
                      </span>
                    </>
                  )}
                  <span
                    aria-hidden="true"
                    className={cn('absolute bottom-0 left-0 h-0.5 rounded-full', tono)}
                    style={{ right: seguidaMismaFila ? -gap : 0 }}
                  />
                </div>
                <VehicleCard vehicle={v} view={view} basePath={basePath} />
              </motion.div>
            )
          })
        )}
      </AnimatePresence>
    </motion.div>
  )
}
