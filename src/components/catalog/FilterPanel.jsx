import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SlidersHorizontal, X } from 'lucide-react'
import { FUEL_TYPES, TRANSMISSIONS } from '@/lib/constants'
import { useCatalogStore } from '@/store/useCatalogStore'
import { cn } from '@/lib/cn'

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-neifert bg-neifert text-white'
          : 'border-glassborder text-ink hover:border-neifert/60'
      )}
    >
      {children}
    </button>
  )
}

function RangeRow({ label, suffix, minVal, maxVal, onMin, onMax, placeholderMax }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={minVal ?? ''}
          onChange={(e) => onMin(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="Mín"
          className="glass h-10 w-full rounded-xl px-3 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <span className="text-ink-3">—</span>
        <input
          type="number"
          inputMode="numeric"
          value={maxVal ?? ''}
          onChange={(e) => onMax(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={placeholderMax || 'Máx'}
          className="glass h-10 w-full rounded-xl px-3 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        {suffix && <span className="shrink-0 text-xs text-ink-3">{suffix}</span>}
      </div>
    </div>
  )
}

export default function FilterPanel(props) {
  const storeFilters = useCatalogStore((s) => s.filters)
  const storeToggle = useCatalogStore((s) => s.toggleInFilter)
  const storeSetFilters = useCatalogStore((s) => s.setFilters)
  const storeClear = useCatalogStore((s) => s.clearFilters)
  const storeCount = useCatalogStore((s) => s.activeFilterCount())

  // Permite usar estado propio (panel admin) o el store del catálogo público.
  const filters = props.filters ?? storeFilters
  const toggleInFilter = props.toggleInFilter ?? storeToggle
  const setFilters = props.setFilters ?? storeSetFilters
  const clearFilters = props.clearFilters ?? storeClear
  const count = props.count ?? storeCount

  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'glass flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-ink transition-colors',
          count > 0 && 'border-neifert'
        )}
      >
        <SlidersHorizontal size={16} />
        <span className="hidden font-semibold sm:inline">Filtros</span>
        {count > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(92vw,22rem)] overflow-auto rounded-2xl p-4 shadow-glass"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-base font-bold text-ink">Filtrar</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-ink-3 transition-colors hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">
                  Combustible
                </p>
                <div className="flex flex-wrap gap-2">
                  {FUEL_TYPES.map((f) => (
                    <Chip
                      key={f}
                      active={filters.fuels.includes(f)}
                      onClick={() => toggleInFilter('fuels', f)}
                    >
                      {f}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">
                  Tipo de caja
                </p>
                <div className="flex flex-wrap gap-2">
                  {TRANSMISSIONS.map((t) => (
                    <Chip
                      key={t}
                      active={filters.transmissions.includes(t)}
                      onClick={() => toggleInFilter('transmissions', t)}
                    >
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>

              <RangeRow
                label="Año"
                minVal={filters.yearMin}
                maxVal={filters.yearMax}
                onMin={(v) => setFilters({ yearMin: v })}
                onMax={(v) => setFilters({ yearMax: v })}
              />

              <RangeRow
                label="Kilómetros"
                suffix="km"
                minVal={filters.kmMin}
                maxVal={filters.kmMax}
                onMin={(v) => setFilters({ kmMin: v })}
                onMax={(v) => setFilters({ kmMax: v })}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                onClick={clearFilters}
                className="text-sm font-semibold text-ink-3 transition-colors hover:text-neifert"
              >
                Limpiar todo
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl bg-neifert px-4 py-2 text-sm font-semibold text-white shadow-glow-red"
              >
                Ver resultados
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
