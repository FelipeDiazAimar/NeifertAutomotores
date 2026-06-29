import { AnimatePresence, motion } from 'framer-motion'
import VehicleCard from './VehicleCard'
import { useCatalogStore } from '@/store/useCatalogStore'
import { cn } from '@/lib/cn'

export default function VehicleGrid({ vehicles }) {
  const view = useCatalogStore((s) => s.viewMode)

  if (vehicles.length === 0) {
    return (
      <div className="glass grid place-items-center rounded-[20px] py-20 text-center">
        <p className="text-ink-2">No encontramos vehículos con esos filtros.</p>
      </div>
    )
  }

  return (
    <motion.div
      layout
      className={cn(
        view === 'grid'
          ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          : 'flex flex-col gap-4'
      )}
    >
      <AnimatePresence mode="popLayout">
        {vehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} view={view} />
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
